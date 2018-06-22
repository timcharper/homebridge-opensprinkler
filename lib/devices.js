function DevicesModule(config, log, openSprinklerApi, Service, Characteristic) {
  let defaultDurationSecs = config.defaultDurationSecs

  function promiseSetter(fn) {
    return (value, next) => {
      fn(value).then(
        (result) => next(),
        (failure) => {
          log("failure " + failure)
          next(failure)
        }
      )
    }
  }

  class RainDelay {
    constructor(rainDelayHoursSetting) {
      this.rainDelayHoursSetting = rainDelayHoursSetting;
      this.name = "Rain Delay";
      this.currentState = false;
    }

    updateState(rd, rainDelayHoursSetting) {
      this.rainDelayHoursSetting = rainDelayHoursSetting
      // log("rain delay = " + rd);
      this.currentState = rd != 0;

      if (this.switchService) {
        this.switchService.getCharacteristic(Characteristic.On).
          updateValue(this.currentState);
      }
    }

    getServices() {
      let informationService = new Service.AccessoryInformation();
      informationService
        .setCharacteristic(Characteristic.Manufacturer, "OpenSprinkler")
        .setCharacteristic(Characteristic.Model, "OpenSprinkler")
        .setCharacteristic(Characteristic.SerialNumber, "opensprinkler-raindelay");

      this.switchService = new Service.Switch(this.name);

      this.switchService
        .getCharacteristic(Characteristic.On)
        .on('get', this.getSwitchOnCharacteristic.bind(this))
        .on('set', promiseSetter(this.setSwitchOnCharacteristic.bind(this)));

      this.informationService = informationService;
      return [informationService, this.switchService];
    }

    getSwitchOnCharacteristic(next) {
      next(null, this.currentState);
    }

    setSwitchOnCharacteristic(on) {
      log("setSprinklerOnCharacteristic " + on)
      if (on)
        return openSprinklerApi.setRainDelay(this.rainDelayHoursSetting)
      else
        return openSprinklerApi.setRainDelay(0)
    }
  }

  class SprinklerStation {
    constructor (name, sid) {
      this.setDuration = defaultDurationSecs
      this.sid = sid;
      this.name = name;
      this.currentlyActive = false;
      this.currentlyInUse = false;
    }

    updateState(currentTime, programId, remaining, startedAt, inUse) {
      this.currentlyInUse = inUse != 0 // inUse means it is spraying water
      this.currentlyActive = programId != 0 // active means it is associated with a program, but may not currently be active
      // log("inUse: " + this.currentlyInUse + " active: " + this.currentlyActive);

      if (this.valveService) {
        this.valveService.getCharacteristic(Characteristic.Active)
			    .updateValue(this.currentlyActive);

		    this.valveService.getCharacteristic(Characteristic.InUse)
			    .updateValue(this.currentlyInUse);

        this.valveService.getCharacteristic(Characteristic.RemainingDuration)
				  .updateValue(remaining);
      }
    }

    getServices() {
      let informationService = new Service.AccessoryInformation();
      informationService
        .setCharacteristic(Characteristic.Manufacturer, "OpenSprinkler")
        .setCharacteristic(Characteristic.Model, "OpenSprinkler")
        .setCharacteristic(Characteristic.SerialNumber, "opensprinkler-" + this.sid);

      this.valveService = new Service.Valve(this.name);
      this.valveService.getCharacteristic(Characteristic.ValveType).updateValue(1);

      this.valveService
        .getCharacteristic(Characteristic.Active)
        .on('get', this.getSprinklerActiveCharacteristic.bind(this))
        .on('set', promiseSetter(this.setSprinklerActiveCharacteristic.bind(this)))

      this.valveService
        .getCharacteristic(Characteristic.InUse)
        .on('get', this.getSprinklerInUseCharacteristic.bind(this))

      this.valveService.addCharacteristic(Characteristic.SetDuration)
        .on('get', (next) => {
          next(null, this.setDuration)
        })
			  .on('set', (duration, next) => {
          this.setDuration = duration
          console.log("SetDuration", duration)
          next()
			  })

      this.valveService.addCharacteristic(Characteristic.RemainingDuration)

      this.informationService = informationService;
      return [informationService, this.valveService];
    }

    getSprinklerActiveCharacteristic(next) {
      log("getSprinklerActiveCharacteristic returning " + this.currentlyActive)
      next(null, this.currentlyActive);
    }

    setSprinklerActiveCharacteristic(on) {
      log("setSprinklerActiveCharacteristic " + on)
      if (on)
        return openSprinklerApi.setValve(this.sid, true, this.setDuration)
      else
        return openSprinklerApi.setValve(this.sid, false, 0)
    }

    getSprinklerInUseCharacteristic(next) {
      log("getSprinklerInUseCharacteristic returning " + this.currentlyInUse)
      next(null, this.currentlyInUse);
    }
  }

  return {RainDelay, SprinklerStation}
}
module.exports = DevicesModule
