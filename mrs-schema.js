const joi = require('joi')

const lat = joi.number().min(-90).max(90).unit('degrees').description('WGS84 latitude')
const lon = joi.number().min(-180).max(180).unit('degrees').description('WGS84 longitude')
const ele = joi.number().min(-180).max(180).unit('metres').description('elevation above WGS ellipsoid')
const range = joi.number().min(0).max(1000000).unit('metres').description('search range')
const FOAD = joi.boolean().description('strict privacy indicator')
const Service_Point = joi.string().uri().description('service point')
const verification = joi.any().description('verification data')

// https://mixedrealitysystem.org/spec/Mixed_Reality_Service_Specification_THIRD_DRAFT.pdf

const entry = joi.object({
  lat,
  lon,
  ele,
  range,
  FOAD,
  Service_Point,
})
.requiredKeys('lat', 'lon', 'ele', 'range', 'FOAD', 'Service_Point')
.description('MRS entry')

const request = joi.object({
  add: entry.keys({
    verification,
  }),
  delete: entry.keys({
    verification,
  }),
  search: joi.object({
    lat,
    lon,
    ele,
    range,
  }).requiredKeys('lat', 'lon', 'ele', 'range'),
})
.xor('add', 'delete', 'search')
.description('MRS request')

const response = joi.object({
  response: joi.object({
    added: joi.boolean().description('indicates whether an entry was added'),
    removed: joi.boolean().description('indicates whether an entry was deleted'),
    matches: joi.number().integer().min(-1).description('match count (-1 for error)'),
    matching: joi.array().items(entry).description('matched entries'),
  })
  .xor('added', 'removed', 'matches')
  .and('matches', 'matching')
  .required()
}).description('MRS response')

module.exports = {
  entry,
  request,
  response,
}
