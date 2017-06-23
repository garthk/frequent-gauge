// server.js
// where your node app starts

const getNSWStateBoundary = require('./nsw-boundary')
const findNSWCadastralBoundaries = require('./nsw-cadastre')
const simplify = require('@turf/simplify')
const express = require('express')
const os = require('os')
const point = require('@turf/helpers').point
const bbox = require('@turf/bbox')
const inside = require('@turf/inside')
const bodyParser = require('body-parser')
const joi = require('joi')
const schema = require('./mrs-schema')
const boom = require('boom')
const Catbox = require('catbox-memory')
const shim = require('./shim')
const centerOfMass= require('@turf/center-of-mass')

const CACHE_SIZE = 10 * 1024 * 1024
const TTL = 3600 * 1000

// we've started you off with Express, 
// but feel free to use whatever libs or frameworks you'd like through `package.json`.

// http://expressjs.com/en/starter/static-files.html

// http://expressjs.com/en/starter/basic-routing.html

const MRSRequest = joi.object({
  search: {
    lat: joi.number().min(-90).max(90).unit('degrees'),
    lon: joi.number().min(-180).max(180).unit('degrees'),
    ele: joi.number().min(-180).max(180).unit('metres'),
    range: joi.number().min(0).unit('metres'),
  }
})

/**
 * Handle an MRS request
 */
async function handleMRSRequest(cache, within, request) {
  console.log('handleMRSRequest', request)
  switch (Object.keys(request)[0]) {
    case 'add':
      throw boom.forbidden()

    case 'delete':
      throw boom.forbidden()

    case 'search':
      const { lat, lon, range } = request.search
      const key = { segment: 'search', id: JSON.stringify({ lat, lon, range }) }
      const entry = await shim(cb => cache.get(key, cb))
      if (entry !== null) {
        return entry;
      }
      if (!inside(point([lon, lat]), within)) {
        const failure = {
          matches: -1,
          matching: [],
        }
        await shim(cb => cache.set(key, failure, cb))
        return failure;
      }
      const cadastres = await findNSWCadastralBoundaries(lat, lon, range)
      const matches = []
      console.log('caching features...')
      for (let feature of cadastres) {
        console.log(feature)
        const key = { segment: 'object', id: feature.id }
        console.log('A')
        await shim(cb => cache.set(key, JSON.stringify(feature), TTL, cb))        
        console.log('B')
      }
      console.log('constructing result...')
      const result = {
        response: {
          matches: cadastres.length,
          matching: cadastres.map(f => {
            console.log('constructing MRS result for', f)
            const middle = centerOfMass(f)
            return {
              lat: middle.geometry.coordinates[1],
              lon: middle.geometry.coordinates[0],
              ele: 0,
              range: 10,
              FOAD: false,
              Service_Point: `https://${process.env.PROJECT_NAME}.glitch.me//object/${f.id}`,
            }
          })
        }
      }
      await shim(cb => cache.set(key, result, cb))
      return result;

    default:
      throw boom.badImplementation('couldn\t determine request type despite validation')
   }
}

function makeApp(cache, nsw) {
  const app = express()
  app.use(express.static('public'));
  app.get('/', function (req, res) {
    res.sendFile(__dirname + '/views/index.html')
  })
  app.get('/nsw.json', function (req, res) {
    res.send(JSON.stringify(nsw))
  })
  app.post('/mrs', bodyParser.json({
    limit: '1kb',
    strict: true,
  }), function (req, res, fail) {
    const request = joi.attempt(req.body, schema.request, 'MRS request')
    handleMRSRequest(cache, nsw, request)
      .then(response => joi.attempt(response, schema.response))
      .then(response => res.send(response), fail)
  })
  app.get('/info', function (req, res) {
    const info = { versions: process.versions };
    Object.keys(os).filter(k => typeof os[k] === 'function').forEach(k => info[k] = os[k]())
    res.send(JSON.stringify(info, null, 2))
  })
  app.use(function errorHandler(err, req, res, next) {
    if (err && err.isBoom) {
      res.status(err.output.statusCode)
         .set(err.output.headers || {})
         .send(err.output.payload)
    } else {
      next(err)
    }
  });
  return app
}

// Writing promise adapters 
function startApp(app) {
  return new Promise((resolve, reject) => {
    const listener = app.listen(process.env.PORT, err => {
      if (err) {
        reject(err)
      } else {
        resolve(listener);
      }
    })
  })
}

const AROUND_1KM_IN_DEGREES = 1/110

async function main() {
  console.log('Getting NSW state boundary...');
  let nsw = await getNSWStateBoundary()
  
  console.log('Simplifying it...')
  nsw = simplify(nsw, AROUND_1KM_IN_DEGREES, true)
  nsw.bbox = bbox(nsw)
  
  console.log('Building app...')
  const cache = new Catbox({ maxBytes: CACHE_SIZE })
  const app = makeApp(cache, nsw)
  
  console.log('Starting it...')
  await shim(cb => cache.start(cb))
  const listener = await startApp(app)
  
  console.log(`Listening on port ${listener.address().port}`)
}

if (!module.parents) {
  main().then(() => undefined).catch(err => {
    console.error(err.stack);
    process.exit(1);
  });
}