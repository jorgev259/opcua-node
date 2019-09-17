const opcua = require('node-opcua')
const program = require('commander')
const path = require('path')
const defaults = require('./defaults.json')

/* program
  .option('-u, --user <username>', 'Username', defaults.user)
  .option('-p, --password <password>', 'Password', defaults.password)
  .option('-h, --host <endpoint url>', 'Endpoint url to connect to', defaults.host)
  .option('-f, --file <filename>', 'Specify filename to save the results to', defaults.file)
  .option('-l, --path <path>', 'Specify path to save the results to', defaults.path)
  .parse(process.argv) */

program
  .version('0.1.0')
  .option('-C, --chdir <path>', 'change the working directory')
  .option('-c, --config <path>', 'set config path. defaults to ./deploy.conf')
  .option('-T, --no-tests', 'ignore test hook')

program
  .command('setup [env]')
  .description('run setup commands for all envs')
  .option('-s, --setup_mode [mode]', 'Which setup mode to use')
  .action(function (env, options) {
    const mode = options.setup_mode || 'normal'
    env = env || 'all'
    console.log('setup for %s env(s) with %s mode', env, mode)
  })

program
  .command('exec <cmd>')
  .alias('ex')
  .description('execute the given remote cmd')
  .option('-e, --exec_mode <mode>', 'Which exec mode to use')
  .action(function (cmd, options) {
    console.log('exec "%s" using %s mode', cmd, options.exec_mode)
  }).on('--help', function () {
    console.log('')
    console.log('Examples:')
    console.log('')
    console.log('  $ deploy exec sequential')
    console.log('  $ deploy exec async')
  })

program
  .command('*')
  .action(function (env) {
    console.log('deploying "%s"', env)
  })

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
    } else console.log(err)
  })
}

function close () {
  session.close(function (err) {
    if (err) {
      console.log('Closing session failed')
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
          } else console.log(err)
        })
      } else {
        items.push([`${thisParent}/${ref.browseName.name}`, ref.browseName.name])
        resolve()
      }
    })
  })
}

connect()
