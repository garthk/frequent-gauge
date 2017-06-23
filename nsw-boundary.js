require('isomorphic-fetch') // add global fetch https://caniuse.com/#search=fetch

const assert = require('assert')
const boom = require('boom') // construct Errors with HTTP semantics
const joi = require('joi') // validate and correct JSON data
const path = require('path')
const url = require('url')
const shim = require('./shim')
const fs = require('fs')

// I could drop a simplified boundary GeoJSON in as source code, but then we'd
// miss out on an opportunity to show people how easy it is to get public
// geospatial data. So, here's the GeoServer URL for the PSMA NSW State Boundary
// feature collection:

const NSW_STATE_BOUNDARY = url.format({
  protocol: 'http:',
  hostname: 'data.gov.au',
  pathname: '/geoserver/nsw-state-boundary/wfs',
  query: {
    request: 'GetFeature',
    typeName: 'a1b278b1_59ef_4dea_8468_50eb09967f18',
    outputFormat: 'json'
  },
});

const ST_POLY_PID = 12624;
const CACHEFILE = path.join(__dirname, '.data', 'NSW.json')

// I'm a fan of asserting my preconditions are met, else crashing right there.
// At a glance, a stack trace from the assertions tells me the root cause is
// elsewhere.
//
// Joi, from the Hapi project, is a great way of checking a whole data 
// structure at once. You can then dereference into the data structure with
// confidence.

const polygonishGeometry = joi.object({
  type: joi.valid('Polygon', 'MultiPolygon'),
  coordinates: joi.array().items(
    joi.any() // not bothering with deep validation
  )
}).unknown(true) // https://tools.ietf.org/html/rfc7946#section-6.1

const polygonishGeometryFeature = joi.object({
  type: joi.valid('Feature'),
  geometry: polygonishGeometry,
  properties: joi.object().unknown(true),
}).unknown(true) // ditto

const getFeatureResult = joi.object({
  type: joi.valid('FeatureCollection'),
  features: joi.array().items(polygonishGeometryFeature),
}).unknown(true)  // ditto

const getFeatureResponse200OK = joi.object({
  status: joi.valid(200)
}).unknown(true)


/**
 * Get the NSW state boundary from the data.gov.au GeoServer.
 *
 * @returns {Promise<GeoJSON.Feature<any>>}
 */
async function getNSWStateBoundary() {
  const resp = await fetch(NSW_STATE_BOUNDARY)
  joi.assert(resp, getFeatureResponse200OK, 'GeoServer response')

  const featureCollection = await resp.json()
  joi.assert(featureCollection, getFeatureResult, 'GeoServer result')
  
  const matches = featureCollection.features.filter(f => f.properties.st_ply_pid == ST_POLY_PID)
  joi.assert(matches, joi.array().length(1), `features with st_ply_pid == ${ST_POLY_PID}`)
  
  return matches[0]  
}

/**
 * Read the boundary file from the cache. Returns a Promise for GeoJSON.
 *
 * @returns {Promise<GeoJSON.Feature<any>>}
 */
async function readCachedBoundary() {
  const raw = await shim(cb => fs.readFile(CACHEFILE, 'utf8', cb))
  return joi.attempt(JSON.parse(raw), polygonishGeometryFeature, 'cached feature')
}

/**
 * Write the boundary file to the cache.
 *
 * @param {GeoJSON.Feature<any>} boundary
 * @returns {Promise<void>}
 */
async function writeCachedBoundary(boundary) {
  await shim(cb => fs.writeFile(CACHEFILE, JSON.stringify(boundary), { encoding: 'utf8' }, cb))
}

/**
 * Get the NSW state boundary, either from the cache file or the
 * data.gov.au GeoServer.
 *
 * @returns {Promise}
 */
module.exports = async function getBoundary() {
  let boundary;
  
  try {
    boundary = await readCachedBoundary()
  } catch (err) {
    if (err.code === 'ENOENT') {
      boundary = await getNSWStateBoundary()
      await writeCachedBoundary(boundary)
    } else {
      throw err;
    }
  }
  
  return boundary
}
