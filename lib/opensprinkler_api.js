const request = require("request-promise-native")
const url = require('url');
const crypto = require('crypto');
const REQUEST_TIMEOUT = 10000

function OpenSprinklerApiModule(config, log) {
  class OpenSprinklerApi {
    constructor() {
      this.baseUrl = "http://" + config.host
      if (config.password.md5)
        this.passwordMd5 = config.password.md5
      else
        this.passwordMd5 = crypto.createHash('md5').update(config.password.plain).digest("hex")
      this.statusUrl = this.urlFor("/ja")
    }

    urlFor(path, params) {
      let url = this.baseUrl + path + "?pw=" + this.passwordMd5
      if (params)
        url = url + "&" + params
      return url
    }

    _withResultHandling(promise, context) {
      return promise.then(
        (body) => {
          let json = JSON.parse(body)
          if (json.result == 1) {
            return true
          } else {
            return Promise.reject("result was " + body);
          }
        },
        (error) => {
          log("ERROR " + context)
          log(error)
          return Promise.reject(error)
        }
      )
    }

    getStatus() {
      try {
        return request({url: this.statusUrl, timeout: REQUEST_TIMEOUT}).then(
          JSON.parse,
          (error) => log(error))
      }
      catch (error) {
        return Promise.reject(error)
      }
    }

    setRainDelay(rd) {
      return this._withResultHandling(request({url: this.urlFor("/cv", "rd=" + rd), timeout: REQUEST_TIMEOUT}), "setRainDelay")
    }

    setValve(sid, enable, time) {
      let params = "sid=" + sid
      if (enable)
        params = params + "&en=1&t=" + time
      else
        params = params + "&en=0"

      return this._withResultHandling(request({url: this.urlFor("/cm", params), timeout: REQUEST_TIMEOUT}), "setValve")
    }
  }
  return OpenSprinklerApi
}

module.exports = OpenSprinklerApiModule
