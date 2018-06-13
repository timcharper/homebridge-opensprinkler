var Service, Characteristic;
const request = require('request');
const url = require('url');
 
function mySwitch(log, config) {
  console.log("its a me")
  this.log = log;
  this.name = "Test switch"
}

module.exports = function (homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  homebridge.registerAccessory("switch-plugin", "MyAwesomeSwitch", mySwitch);
};

var currentState = false;

mySwitch.prototype = {
  getServices: function () {
    let informationService = new Service.AccessoryInformation();
    informationService
      .setCharacteristic(Characteristic.Manufacturer, "My switch manufacturer")
      .setCharacteristic(Characteristic.Model, "My switch model")
      .setCharacteristic(Characteristic.SerialNumber, "123-456-789");
 
    let switchService = new Service.Switch("My switch");
    switchService
      .getCharacteristic(Characteristic.On)
        .on('get', this.getSwitchOnCharacteristic.bind(this))
        .on('set', this.setSwitchOnCharacteristic.bind(this));
 
    this.informationService = informationService;
    this.switchService = switchService;
    return [informationService, switchService];
  },

  getSwitchOnCharacteristic: function (next) {
    this.log("getSwitchOnCharacteristic returning " + currentState)
    const me = this;
    // request({
    //     url: me.getUrl,
    //     method: 'GET',
    // }, 
    // function (error, response, body) {
    //   if (error) {
    //     me.log('STATUS: ' + response.statusCode);
    //     me.log(error.message);
    //     return next(error);
    //   }
    //   return next(null, body.currentState);
    // });
    next(null, currentState);
  },
   
  setSwitchOnCharacteristic: function (on, next) {
    this.log("setSwitchOnCharacteristic " + on)
    currentState = on;
    next();
  }
};
