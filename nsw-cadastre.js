require('isomorphic-fetch') // add global fetch https://caniuse.com/#search=fetch

const buffer = require('@turf/buffer')
const joi = require('joi')
const point = require('@turf/helpers').point
const proj4 = require('proj4')
const querystring = require('querystring')
const throttle = require('./throttle')

const project = proj4(proj4.defs['EPSG:3857'], proj4.defs['EPSG:4326'])
const MAPSERVER = 'https://maps.six.nsw.gov.au/arcgis/rest/services/public/NSW_Cadastre/MapServer'
const LAYER = 9
const CONCURRENCY = 3

const is200OK = joi.object({
  status: joi.valid(200)
}).unknown(true)

const searchResponse = joi.object({
  features: joi.array().items(joi.object({
    attributes: joi.object({
      objectid: joi.number().integer().required(),
    }).unknown(false)
  })).required(),
}).unknown(true)

const getObjectResponse = joi.object({
  feature: joi.object({
    attributes: joi.object({
      objectid: joi.number().integer().required(),
      lotidstring: joi.string(),
    }).unknown(true).required(),
    geometry: joi.object({
      rings: joi.array().items(
        joi.array().items(
          joi.array().items(joi.number()).length(2)
        )
      )
    }).required()
  }).required(),
}).unknown(true)

/**
 * Get cadastral boundaries from the Lands NSW ESRI MapServer.
 *
 * @param {Number} lat - WGS84 latitude in degrees
 * @param {Number} lng - WGS84 longitude in degrees
 * @param {Number} range - radius in metres
 * @returns {Promise<GeoJSON.Feature<any>[]>}
 */
module.exports = async function findNSWCadastralBoundaries(lat, lng, range) {
  const center = point([ lng, lat ])
  const queryBoundary = buffer(center, range / 1000, 'kilometres')
  const request = {
    where: '1=1',
    geometry: JSON.stringify({
      rings: queryBoundary.geometry.coordinates,
      spatialReference: 4326,
    }),
    geometryType: 'esriGeometryPolygon',
    inSR: 4326,
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'objectid',
    returnGeometry: false,
    f: 'json',
  }
  const resp = await fetch(`${MAPSERVER}/${LAYER}/query`, {
    method: 'POST',
    body: querystring.stringify(request),
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json'
    }
  })
  joi.assert(resp, is200OK, 'GeoServer response')
  
  const idsResponse = await resp.json()
  joi.assert(idsResponse, searchResponse, 'GeoServer search esponse')
  
  const objectids = idsResponse.features.map(f => f.attributes.objectid)
  return throttle(objectids, CONCURRENCY, async objectid => {
    const oburi = `${MAPSERVER}/${LAYER}/${objectid}?f=json`;
    console.log(oburi)
    const resp = await fetch(oburi)
    joi.assert(resp, is200OK, 'GeoServer response')
    const object = await resp.json()
    joi.assert(object, getObjectResponse, 'GeoServer object response')
    return {
      type: 'Feature',
      id: objectid,
      properties: {
        lotid: object.feature.attributes.lotidstring
      },
      geometry: {
        type: 'Polygon',
        coordinates: wm2gps(object.feature.geometry.rings)
      }
    } 
  })
}

function wm2gps(rings) {
  return rings.map(
    ring => ring.map(
      position => project.forward(position)
    )
  )
}