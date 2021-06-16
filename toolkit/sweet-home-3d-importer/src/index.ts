/* eslint-disable no-console */
/* eslint-disable no-warning-comments */
import {Command, flags} from '@oclif/command'
import AdmZip = require('adm-zip')
import {spawn} from 'child_process'
import {parse} from 'fast-xml-parser'
import {mkdir, mkdtemp, readFileSync, rmdirSync, unlinkSync, writeFile} from 'fs'
const obj2gltf = require('obj2gltf')
import {tmpdir} from 'os'
import {basename, extname, join} from 'path'
import {stringify} from 'yaml'

class RoomcanvasSweetHome3DImporter extends Command {
  static description = 'CLI to import a RoomCanvas building model from assets exported by Sweet Home 3D'

  static flags = {
    // TODO: Accept and properly handle the commented-out, additional options/flags
    version: flags.version({char: 'v'}),
    help: flags.help({char: 'h'}),
    'obj-no-furniture-file': flags.string({required: true, description: 'set path to a ZIP file exported from Sweet Home 3D via "Export to XML/OBJ format"'}),
    'obj-furniture-file': flags.string({description: 'set path to an OBJ file exported from Sweet Home 3D via "Export to OBJ format..."'}),
    // "sh3d-file": flags.string({required: true, description: 'set path to the SH3D file of the Sweet Home 3D plan'}),
    'blender-executable': flags.string({required: true, description: 'set path to the Blender executable'}),
    // output: flags.string({char: 'o', description: 'set output path for the generated RoomCanvas assets. Defaults to the name of the SH3D file'}),
    // "metadata-name": flags.string({char: 'n', description: 'set display name of the imported building model'}),
  }

  static args = []

  async run() {
    const {flags} = this.parse(RoomcanvasSweetHome3DImporter)

    const objNoFurnitureZip = new AdmZip(flags['obj-no-furniture-file'])

    // Get metadata from Home.xml file inside the exported ZIP file/SH3D file

    // TODO: Fall back to using the SH3D file in case this ZIP file/the contained Home.xml does not exist

    const homeXml = objNoFurnitureZip.readAsText('Home.xml')

    const homeJsonObject = parse(homeXml, {
      ignoreAttributes: false,
    })

    const latitudeRadians = homeJsonObject.home.compass['@_latitude']
    const latitude = latitudeRadians * 180 / Math.PI
    const longitudeRadians = homeJsonObject.home.compass['@_longitude']
    const longitude = longitudeRadians * 180 / Math.PI
    const northOffsetRadians = Number(homeJsonObject.home.compass['@_northDirection'])
    const timeZone = homeJsonObject.home.compass['@_timeZone']

    const wallHeightInM = Number(homeJsonObject.home['@_wallHeight']) / 100

    console.log({
      latitude,
      longitude,
      northOffsetRadians,
      timeZone,
      wallHeightInM,
    })

    // TODO: Extract the default camera position, storedCamera/observerCamera, and room shapes from the Home.xml as well

    // let outputPath = flags.output ?? basename(flags['sh3d-file'], extname(flags['sh3d-file']))
    const outputPath = basename(flags['obj-no-furniture-file'], extname(flags['obj-no-furniture-file']))
    const hierarchyGltfFilename = `${outputPath}__hierarchy.gltf`

    let buildingConfig = {
      positionAndLocale: {
        latitude,
        longitude,
        northOffsetRadians,
        timeZone,
      },
      buildingModel: {
        presentationGlb: `${outputPath}.glb`,
        hierarchyGltf: hierarchyGltfFilename,
      },
    } as any

    const outConfigYaml = stringify(buildingConfig)

    mkdir(join(outputPath, 'properties'), {recursive: true}, () => {
      writeFile(join(outputPath, 'properties/config.yaml'), outConfigYaml, {}, () => undefined)
    })

    // Convert the OBJ file included in the ZIP file to GLB

    mkdtemp(join(tmpdir(), 'roomcanvas-sh3d-import-'), async (err, tempDir) => {
      if (err) throw err
      objNoFurnitureZip.extractEntryTo('HomeStructure/Home.obj', tempDir)
      objNoFurnitureZip.extractEntryTo('HomeStructure/Home.mtl', tempDir)

      let apartmentBboxMin: [number, number, number]
      let apartmentBboxMax: [number, number, number]

      if (flags['obj-furniture-file']) {
        const reportDimensions = () => new Promise<void>((resolve, reject) => {
          obj2gltf(flags['obj-furniture-file'], {binary: true}).then((furnitureGlb: any) => {
            const furnitureGlbTmpPath = join(tempDir, 'obj-furniture-file.glb')
            writeFile(furnitureGlbTmpPath, furnitureGlb, () => {
              const blender = spawn(flags['blender-executable'], [
                '--background',
                '--factory-startup',
                '--python',
                'lib/blender/get-gltf-dimensions.py',
                '--',
                `--input=${furnitureGlbTmpPath}`,

              ])
              blender.stdout.on('data', data => {
                console.log(`stdout: ${data}`)
              })
              blender.stderr.on('data', data => {
                console.error(`stderr: ${data}`)
                reject()
              })
              blender.on('close', code => {
                if (code === 0) {
                  // Read back the reported dimensions of the GLTF file
                  const jsonPath = furnitureGlbTmpPath.replace('.glb', '__dimensions.json')
                  const dimensionsJson = readFileSync(jsonPath, 'utf8')
                  const dimensions = JSON.parse(dimensionsJson)

                  apartmentBboxMin = [Number(dimensions.apartmentBboxMin[0]), Number(dimensions.apartmentBboxMin[1]), Number(dimensions.apartmentBboxMin[2])]
                  apartmentBboxMax = [Number(dimensions.apartmentBboxMax[0]), Number(dimensions.apartmentBboxMax[1]), Number(dimensions.apartmentBboxMax[2])]

                  // Clean up
                  unlinkSync(furnitureGlbTmpPath)
                  unlinkSync(jsonPath)

                  resolve()
                }
              })
            })
          })
        })
        await reportDimensions()
      }

      mkdir(join(outputPath, '3d-floor-plans'), {recursive: true}, async () => {
        const gltfPath = join(outputPath, '3d-floor-plans', hierarchyGltfFilename)

        // Create the hierarchy GLTF file using Blender, taking the Home.xml contents into account
        const homeXmlJsonPath = join(tempDir, 'Home.xml.json')
        writeFile(homeXmlJsonPath, JSON.stringify(homeJsonObject), () => {
          const blender = spawn(flags['blender-executable'], [
            '--background',
            '--factory-startup',
            '--python',
            'lib/blender/create-hierarchy-gltf.py',
            '--',
            `--input=${homeXmlJsonPath}`,
            `--output=${gltfPath}`,
          ])
          blender.stdout.on('data', data => {
            console.log(`stdout: ${data}`)
          })
          blender.stderr.on('data', data => {
            console.error(`stderr: ${data}`)
          })
          blender.on('close', code => {
            if (code === 0) {
              // TODO: Copy the resulting .gltf file to the appropriate directory and clean-up afterwards
            }
          })
        })

        const glb = await obj2gltf(join(tempDir, 'HomeStructure/Home.obj'), {binary: true})

        const glbPath = join(outputPath, '3d-floor-plans', `${outputPath}.glb`)
        writeFile(glbPath, glb, () => {
          // Fix the GLTF/GLB scaling and determine the apartment AABB using Blender
          const blender = spawn(flags['blender-executable'], [
            '--background',
            '--factory-startup',
            '--python',
            'lib/blender/scale-gltf-and-report-dimensions.py',
            '--',
            `--input=${glbPath}`,
            (apartmentBboxMin && apartmentBboxMax) ? `--translation-to-bbox-min="${-apartmentBboxMin[0]},${-apartmentBboxMin[1]},${-apartmentBboxMin[2]}"` : '',
          ])
          blender.stdout.on('data', data => {
            console.log(`stdout: ${data}`)
          })
          blender.stderr.on('data', data => {
            console.error(`stderr: ${data}`)
          })
          blender.on('close', code => {
            if (code === 0) {
              // Read back the reported dimensions from JSON and append them to the YAML file
              const jsonPath = glbPath.replace('.glb', '__dimensions.json')
              const dimensionsJson = readFileSync(jsonPath, 'utf8')
              const dimensions = JSON.parse(dimensionsJson)

              apartmentBboxMin = dimensions.apartmentBboxMin
              apartmentBboxMax = dimensions.apartmentBboxMax

              buildingConfig = {
                ...buildingConfig,
                buildingModel: {
                  ...buildingConfig.buildingModel,
                  presentationGlb: `${outputPath}.glb`.replace('.glb', '__scaled.glb'),
                  apartmentBboxMin,
                  apartmentBboxMax,
                },
              }

              const outConfigYaml = stringify(buildingConfig)
              // eslint-disable-next-line max-nested-callbacks
              writeFile(join(outputPath, 'properties/config.yaml'), outConfigYaml, {}, () => {
                // Clean up
                unlinkSync(jsonPath)
                unlinkSync(glbPath)
                unlinkSync(homeXmlJsonPath)
                unlinkSync(join(tempDir, 'HomeStructure/Home.obj'))
                unlinkSync(join(tempDir, 'HomeStructure/Home.mtl'))
                rmdirSync(join(tempDir, 'HomeStructure'))
                rmdirSync(tempDir)
              })
            }
          })
        })
      })
    })
  }
}

export = RoomcanvasSweetHome3DImporter
