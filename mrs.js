const schema = require('./mrs-schema')
const { findObjects, getObject } = require('./nsw-cadastre')
const throttle = require('./throttle')
const cacheify = require('./cacheify')

const joi = require('joi')

const center = require('@turf/center')
const distance = require('@turf/distance')
const { point } = require('@turf/helpers')
const inside = require('@turf/inside')
const { coordAll } = require('@turf/meta')

const CONCURRENCY = 3

/**
 * Handle an MRS request
 */
module.exports = async function handleMRSRequest(cache, within, request) {
  console.log('handleMRSRequest', request)
  request = joi.attempt(request, schema.request, 'MRS request')
  switch (Object.keys(request)[0]) {
    case 'add':
      throw boom.forbidden()

    case 'delete':
      throw boom.forbidden()

    case 'search':
      const { lat, lon, range } = request.search
      if (!inside(point([lon, lat]), within)) {
        return {
          matches: -1,
          matching: [],
        }
      }

      const cadastres = await findCadastres(cache, lat, lon, range)
      const matches = []
      return {
        response: {
          matches: cadastres.length,
          matching: cadastres.map(f => {
            const middle = center(f)
            const range = Math.max(... coordAll(f).map(lonlat => distance(middle, point(lonlat), 'kilometres'))) * 1000
            return {
              lat: middle.geometry.coordinates[1].toFixed(6),
              lon: middle.geometry.coordinates[0].toFixed(6),
              ele: 0,
              range: range.toPrecision(1),
              FOAD: false,
              Service_Point: `https://${process.env.PROJECT_NAME}.glitch.me/object/${f.id}`,
            }
          })
        }
      }

    default:
      throw boom.badImplementation('couldn\t determine request type despite validation')
   }
}

/**
 * Find cadastral boundaries. Use the cache to help.
 *
 * @param {ClientApi} cache
 * @param {Number} lat
 * @param {Number} lon
 * @param {Number} range
 */
async function findCadastres(cache, lat, lon, range) {
  const cachedFindObjects = cacheify(findObjects, { cache })
  const cachedGetObject = cacheify(getObject, { cache })

  const objectIds = await cachedFindObjects(lat, lon, range)
  return throttle(objectIds, CONCURRENCY, cachedGetObject)
}
