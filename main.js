#!/usr/bin/env node
const opcua = require('node-opcua')
const program = require('commander')
const path = require('path')
const defaults = require('./defaults.json')

program
  .option('-u, --user <username>', 'Username', defaults.user)
  .option('-p, --password <password>', 'Password', defaults.password)
  .option('-h, --host <endpoint url>', 'Endpoint url to connect to', defaults.host)
  .option('-f, --file <filename>', 'Specify filename to save the results to', defaults.file)
  .option('-l, --path <path>', 'Specify path to save the results to', defaults.path)
  .parse(process.argv)

program.parse(process.argv)

const items = []
let session

const endpointUrl = program.host
const client = opcua.OPCUAClient.create({ endpoint_must_exist: false })
client.on('backoff', (retry, delay) =>
  console.log('Still trying to connect to ', endpointUrl, ': retry =', retry, 'next attempt in ', delay / 1000, 'seconds')
)
function connect () {
  client.connect(endpointUrl, function (err) {
    if (err) {
      console.log('Cannot connect to endpoint :', endpointUrl)
      process.exit()
    } else {
      console.log('Connected')
      createSession()
    }
  })
}

function createSession () {
  client.createSession(function (err, sessionOut) {
    if (err) {
      console.log(err)
      process.exit()
    }
    console.log('Session created')
    session = sessionOut
    browse()
  })
}

function browse () {
  session.browse('ObjectsFolder', function (err, browseResult) {
    if (!err) {
      const parent = ''
      evalObject(parent, browseResult.references).then(() => {
        console.log('Reading completed. Writing file...')

        const createCsvWriter = require('csv-writer').createArrayCsvWriter
        const csvWriter = createCsvWriter({
          header: ['PATH', 'NAME'],
          path: path.join(program.path, program.file)
        })

        csvWriter.writeRecords(items)
          .then(() => {
            console.log('File saved')
            close()
          })
      })
    } else {
      console.log(err)
      process.exit()
    }
  })
}

function close () {
  session.close(function (err) {
    if (err) {
      console.log('Closing session failed')
      process.exit()
    }
    console.log('Session closed')
    client.disconnect(process.exit)
  })
}

function evalObject (parent, refs) {
  return new Promise((resolve, reject) => {
    const thisParent = parent
    const promiseList = getPromises(refs, thisParent)
    Promise.all(promiseList).then(resolve)
  })
}

function getPromises (refs, thisParent) {
  return refs.map(ref => {
    return new Promise((resolve, reject) => {
      if (ref.nodeClass === 1) {
        session.browse(ref.nodeId, function (err, browseResult) {
          if (!err) {
            evalObject(`${thisParent}/${ref.browseName.name}`, browseResult.references).then(() => {
              resolve()
            })
          } else {
            console.log(err)
            reject(err)
          }
        })
      } else {
        items.push([`${thisParent}/${ref.browseName.name}`, ref.browseName.name])
        resolve()
      }
    })
  })
}

connect()
