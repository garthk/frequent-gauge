const joi = require('joi')
const shim = require('./shim')
const assert = require('assert')

const TTL = 3600 * 1000

module.exports = cacheify

const cacheDetails = joi.object({
  cache: joi.object({
    get: joi.func(),
    set: joi.func(),
  }).unknown(true).required(),
  segment: joi.string(),
  makeKey: joi.func(),
  ttl: joi.number().default(TTL)
}).unknown(false)

/**
 * Cache a function's results.
 *
 * @param {Function} fn
 * @param {CacheDetails} details
 */
function cacheify(fn, details) {
  assert.equal(typeof fn, 'function')
  let { cache, makeKey, segment, ttl } = joi.attempt(details, cacheDetails)
  segment = segment || fn.name || 'hope-is-not-a-strategy'
  return cached

  async function cached(... args) {
    const id = makeKey ? makeKey(... args) : args.map(a => JSON.stringify(a)).join('/')
    const key = { segment, id }
    const entry = await shim(cb => cache.get(key, cb))

    if (entry) {
        console.log(`HIT ${segment} ${id}`)
        return entry.item

    } else {
      console.log(`MISS ${segment} ${id}`)
      const item = await fn(... args)
      await shim(cb => cache.set(key, item, ttl, cb))
      return item
    }
  }
}
