const assert = require('assert')

function throttle(array, limit, mapper) {
  assert(array instanceof Array)
  assert(typeof mapper === 'function')
  assert(typeof limit === 'number')
  assert(limit >= 1)
  array = array.slice()
  const length = array.length
  if (length <= limit) {
    return Promise.all(array.map(mapper))
  }
  return new Promise((resolve, reject) => {
    const results = [];
    const proc = item => mapper(item).then(result => {
      results.push(result);
      if (results.length === length) {
        resolve(results)
      } else if (array.length > 0){
        proc(array.shift())
      }
    }, reject)
    array.splice(0, limit).forEach(proc)  
  })
}

module.exports = throttle

if (!module.parent) {
  const shim = require('./shim')
  let airborne = 0
  throttle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], n => shim(cb => {
    console.log('processing', n, 'airborne', airborne, '...')
    airborne++
    setTimeout(() => {
      airborne--
      console.log('... processed', n, 'airborne', airborne)
      cb(null, n * 2)
    }, Math.random() * 100)
  }), 3).then(results => console.log('results', results))
}