var Service, Characteristic;
const request = require('request');
const url = require('url');
 
function mySprinkler(log, config) {
  console.log("its a me")
  this.log = log;
  this.name = "Test valve"
}

module.exports = function (homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  homebridge.registerAccessory("valve-plugin", "MyAwesomeSprinkler", mySprinkler);
};

var currentState = false;

mySprinkler.prototype = {
  getServices: function () {
    let informationService = new Service.AccessoryInformation();
    informationService
      .setCharacteristic(Characteristic.Manufacturer, "OpenSprinkler")
      .setCharacteristic(Characteristic.Model, "lolol")
      .setCharacteristic(Characteristic.SerialNumber, "123-456-789");
 
    this.valveService = new Service.Valve(this.name);
    this.valveService.getCharacteristic(Characteristic.ValveType).updateValue(1);

    this.valveService
      .getCharacteristic(Characteristic.Active)
        .on('get', this.getSprinklerOnCharacteristic.bind(this))
        .on('set', this.setSprinklerOnCharacteristic.bind(this));
 
    this.informationService = informationService;
    return [informationService, this.valveService];
  },

  getSprinklerOnCharacteristic: function (next) {
    this.log("getSprinklerOnCharacteristic returning " + currentState)
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
   
  setSprinklerOnCharacteristic: function (on, next) {
    this.log("setSprinklerOnCharacteristic " + on)
    currentState = on;
    next();
  }
};
