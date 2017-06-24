# `frequent-gauge`

A randomly named experiment on hooking up existing geospatial services to the
[Mixed Reality Service][MRS] RPC over HTTP API, starring:

* The [NSW State Boundary][NSW_Bounds] from the PSMA Administrative Boundaries
  dataset made available via `data.gov.au`

* [NSW cadastral boundaries][NSW_Cadastre] from the Lands NSW ESRI MapServer at
  `maps.six.nsw.gov.au`

* [GeoJSON (RFC 7946)][rfc7946] as the most convenient way of delivering low
  detail coordinate information to a web browser

Usage:

* `POST` a well formed MRS `search` request to `/mrs`, keeping `range` small

* Wait around 1000ms, plus another 300ms per property boundary in range

* Observe the MRS result with, hopefully, `response.matches` greater than zero
  and a matching number of entries in `response.matching`

* Fetch any mentioned `Service_Point` within an hour

* Observe a well formed GeoJSON `Feature` with a geometry describing the
  object's cadastral boundary, `id` matching the Lands NSW object ID, and
  `properties.lotid` giving the legal property identifier (aka "DP")

Example MRS response:

    {
      "response": {
        "matches": 49,
        "matching": [{
          "lat": -33.871458,
          "lon": 151.204436,
          "ele": 0,
          "range": 50,
          "FOAD": false,
          "Service_Point": "https://frequent-gauge.glitch.me/object/1249790"
        }]
      }
    }

Example GeoJSON service point response:

    {
      "type": "Feature",
      "id": 1249790,
      "properties": {
          "lotid": "11//DP777449"
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [[
          [ 151.20484765339108, -33.871646234190706 ],
          [ 151.204541605234, -33.87168011862984 ],
          [ 151.2044444546818, -33.87169087486667 ],
          [ 151.20445952279786, -33.87180099732248 ],
          [ 151.20445962161253, -33.871801715211994 ],
          [ 151.20407969151495, -33.871834119991775 ],
          [ 151.2040233806214, -33.871334726818255 ],
          [ 151.20419952228224, -33.871319102845426 ],
          [ 151.20417550806894, -33.871222677566415 ],
          [ 151.20414937832305, -33.871142476607915 ],
          [ 151.20477504593535, -33.87108102849976 ],
          [ 151.20484765339108, -33.871646234190706 ]
        ]]
      }
    }

[MRS]: https://mixedrealitysystem.org/
[NSW_Bounds]: https://data.gov.au/dataset/a1b278b1-59ef-4dea-8468-50eb09967f18
[NSW_Cadastre]: http://maps.six.nsw.gov.au/arcgis/rest/services/public/NSW_Cadastre/MapServer
[rfc7946]: https://tools.ietf.org/html/rfc7946