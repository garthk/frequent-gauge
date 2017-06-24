const getNSWStateBoundary = require('./nsw-boundary')
const schema = require('./mrs-schema')
const shim = require('./shim')
const handleMRSRequest = require('./mrs')

const Catbox = require('catbox-memory')
const bodyParser = require('body-parser')
const boom = require('boom')
const express = require('express')
const fs = require('fs')
const https = require('https')
const joi = require('joi')
const markdown = require('markdown').markdown
const nunjucks = require('nunjucks')
const path = require('path')

const bbox = require('@turf/bbox')
const simplify = require('@turf/simplify')

const CACHE_SIZE = 10 * 1024 * 1024

/**
 * Handle a request for one of the `Service_Point` values we issued
 */
async function handleObjectRequest(cache, objectid) {
  const key = { segment: 'object', id: objectid.toString() }
  const entry = await shim(cb => cache.get(key, cb))
  if (entry === null) {
    throw boom.notFound(`object ${objectid}`)
  }
  return entry.item
}

async function getREADME() {
  const raw = await shim(cb => fs.readFile(path.join(__dirname, 'README.md'), 'utf8', cb))
  return markdown.toHTML(raw)
}

function makeApp(cache, nsw) {
  const app = express()
  app.use(express.static(path.join(__dirname, 'public')));

  nunjucks.configure(path.join(__dirname, 'views'), {
      autoescape: true,
      express: app
  });

  app.get('/', function (req, res, fail) {
    console.log(req.method, req.url, req.path)
    getREADME().then(readme => {
      res.render('index.html', { readme })
    }, fail)
  })

  app.get('/nsw.json', function (req, res) {
    res.send(JSON.stringify(nsw))
  })

  app.post('/mrs', bodyParser.json({
    limit: '1kb',
    strict: true,
  }), function (req, res, fail) {
    handleMRSRequest(cache, nsw, req.body)
      .then(response => joi.attempt(response, schema.response))
      .then(response => res.send(response), fail)
  })

  app.get('/object/*', function (req, res, fail) {
    const { method, path } = req
    const objectid = path.split('/')[2]

    if (!objectid) {
      fail(boom.notFound(`${method} ${path}`, { method, path }))
    } else {
      handleObjectRequest(cache, objectid).then(ob => res.type('application/geo+json').send(ob), fail)
    }
  })

  app.use(function noRouteSo404(req, res, fail) {
    const { path, method } = req
    fail(boom.notFound(`${method} ${path}`, { method, path }))
  })

  app.use(function errorHandler(err, req, res, next) {
    if (!err) {
      return next()
    }

    if (!err.isBoom) {
      console.error(err.stack)
      err = boom.create(500, err.toString(), err.stack)
    }

    let { data } = err
    if (typeof data !== 'string') {
      data = JSON.stringify(data, null, 2)
    }

    const { statusCode, headers, payload } = err.output
    const { message, error } = payload

    res.status(statusCode)
    res.set(headers)

    if (req.accepts('html')) {
      res.render('error.html', { error, statusCode, message, data })

    } else if (req.accepts('json')) {
      res.send({ statusCode, error, message, data })

  } else {
      res.send(`${statusCode} ${error}: ${message}\n`)
    }
  });
  return app
}

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
  https.globalAgent.maxSockets = 5
  main().then(() => undefined).catch(err => {
    console.error(err.stack);
    process.exit(1);
  });
}
