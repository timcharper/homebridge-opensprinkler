function DevicesModule(config, log, openSprinklerApi, Service, Characteristic) {
  let defaultDurationSecs = config.defaultDurationSecs
  let pollTimeoutThresholdMs = config.pollIntervalMs * 3

  function syncGetter(fn) {
    return (next) => {
      try {
        next(null, fn())
      }
      catch (error) {
        log("error ", error)
        next(error)
      }
    }
  }

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

  /** Tracks poll updates; if no update after threshold, throw errors */
  class PollUpdateTracker {
    constructor(name) {
      this.name = name
      this.nudge()
    }
    nudge() {
      this.lastHeard = Date.now()
    }
    assertRecent() {
      let durationSinceLastHeardMs = Date.now() - this.lastHeard
      if (durationSinceLastHeardMs > pollTimeoutThresholdMs)
        throw("Haven't heard an update from " + this.name + " for the past " + durationSinceLastHeardMs + " ms")
    }
  }

  class RainDelay {
    constructor(rainDelayHoursSetting) {
      this.rainDelayHoursSetting = rainDelayHoursSetting;
      this.name = "Rain Delay";
      this.currentState = false;
      this.pollUpdateTracker = new PollUpdateTracker("RainDelay")
    }

    updateState(rd, rainDelayHoursSetting) {
      this.pollUpdateTracker.nudge()
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
        .on('get', syncGetter(this.getSwitchOnCharacteristic.bind(this)))
        .on('set', promiseSetter(this.setSwitchOnCharacteristic.bind(this)));

      this.informationService = informationService;
      return [informationService, this.switchService];
    }

    getSwitchOnCharacteristic() {
      this.pollUpdateTracker.assertRecent()
      return this.currentState;
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
      this.pollUpdateTracker = new PollUpdateTracker("SprinklerStation " + name)
    }

    updateState(currentTime, programId, remaining, startedAt, inUse) {
      this.pollUpdateTracker.nudge()
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
        .on('get', syncGetter(this.getSprinklerActiveCharacteristic.bind(this)))
        .on('set', promiseSetter(this.setSprinklerActiveCharacteristic.bind(this)))

      this.valveService
        .getCharacteristic(Characteristic.InUse)
        .on('get', syncGetter(this.getSprinklerInUseCharacteristic.bind(this)))

      this.valveService.addCharacteristic(Characteristic.SetDuration)
        .on('get', syncGetter(() => this.setDuration))
			  .on('set', (duration, next) => {
          this.setDuration = duration
          log.debug("SetDuration", duration)
          next()
			  })

      this.valveService.addCharacteristic(Characteristic.RemainingDuration)

      this.informationService = informationService;
      return [informationService, this.valveService];
    }

    getSprinklerActiveCharacteristic() {
      this.pollUpdateTracker.assertRecent()
      log("getSprinklerActiveCharacteristic returning " + this.currentlyActive)
      return this.currentlyActive
    }

    setSprinklerActiveCharacteristic(on) {
      log("setSprinklerActiveCharacteristic " + on)
      if (on)
        return openSprinklerApi.setValve(this.sid, true, this.setDuration)
      else
        return openSprinklerApi.setValve(this.sid, false, 0)
    }

    getSprinklerInUseCharacteristic() {
      this.pollUpdateTracker.assertRecent()
      log("getSprinklerInUseCharacteristic returning " + this.currentlyInUse)
      return this.currentlyInUse;
    }
  }

  return {RainDelay, SprinklerStation}
}
module.exports = DevicesModule
