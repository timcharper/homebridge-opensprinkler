var Accessory, Service, Characteristic, UUIDGen;
const request = require("request-promise-native")
const OpenSprinklerApiModule = require("./lib/opensprinkler_api.js")
const DevicesModule = require("./lib/devices.js")
const SystemModule = require("./lib/system.js")
const PromiseFinally = require('promise.prototype.finally')

PromiseFinally.shim()

module.exports = function (homebridge) {
  Accessory = homebridge.platformAccessory;
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  UUIDGen = homebridge.hap.uuid;

  class SprinklerPlatform {
    constructor(log, config, api) {
      this.name = "OpenSprinkler"
      this.log = log;
      this.api = api;

      config.pollIntervalMs = config.pollIntervalMs || 5000
      config.defaultDurationSecs = config.defaultDurationSecs || 600
      config.enabledStationIds = config.enabledStationIds || [0,1,2,3]
      if (!config.host) {
        throw("Host must be specified in the configuration!")
      }
      if (!config.password) {
        throw("Password must be specified in the configuration!")
      }

      let OpenSprinklerApi = OpenSprinklerApiModule(config, log)
      let openSprinklerApi = new OpenSprinklerApi()
      let Devices = DevicesModule(config, log, openSprinklerApi, Service, Characteristic)
      let System = SystemModule(config, log, openSprinklerApi, Devices)
      this.systemPromise = System.connect()
    }

    accessories(next) {
      this.systemPromise.then(
        (system) => next(system.getAccessories()),
        (error) => {
          this.log(error)
          throw(error)
        }
      )
    }
  }

  homebridge.registerPlatform("homebridge-opensprinkler", "OpenSprinkler", SprinklerPlatform);

};

