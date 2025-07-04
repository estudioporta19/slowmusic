const mdns = require("mdns");
const SoundTouchAPI = require("./api");

const SoundTouchDiscovery = function () {
  this.devices = [];
};

SoundTouchDiscovery.prototype.addDevice = function (device) {
  this.devices[device.name] = device;
};

SoundTouchDiscovery.prototype.deleteDevice = function (device) {
  delete this.devices[device.name];
};

SoundTouchDiscovery.prototype.getDevices = function () {
  return this.devices;
};

SoundTouchDiscovery.prototype.getDevice = function (name) {
  for (const key in this.devices) {
    if (this.devices[key].getDevice().name === name) {
      return this.devices[key];
    }
  }
};

SoundTouchDiscovery.prototype.getDeviceForMacAddress = function (mac) {
  for (const key in this.devices) {
    if (this.devices[key].getDevice().mac_address === mac) {
      return this.devices[key];
    }
  }
};

SoundTouchDiscovery.prototype.getDevicesArray = function () {
  const result = [];
  for (const key in this.devices) {
    const device = this.devices[key].getDevice();
    result.push(device);
  }
  return result;
};

SoundTouchDiscovery.prototype.createZone = function (macAddresses, callback) {
  let xml = "";
  const zone = {};

  for (let i = 0; i < macAddresses.length; i++) {
    const mac = macAddresses[i];
    if (i === 0) {
      zone.master = mac;
      xml += `<zone master="${mac}" senderIPAddress="127.0.0.1">`;
    } else {
      if (!zone.slaves) zone.slaves = [];
      zone.slaves.push(mac);
      xml += `<member>${mac}</member>`;
    }
  }

  xml += `</zone>`;

  const masterDevice = this.getDeviceForMacAddress(zone.master);
  if (masterDevice) {
    masterDevice._setForDevice("setZone", xml, function (response) {
      callback(response, zone);
    });
  }
};

SoundTouchDiscovery.prototype.search = function (onDeviceUp, onDeviceDown) {
  console.log("Started Searching...");

  const resolverSequence = [
    mdns.rst.DNSServiceResolve(),
    mdns.rst.getaddrinfo({ families: [4] }),
  ];

  const self = this;
  this.browser = mdns.createBrowser(mdns.tcp("soundtouch"), {
    resolverSequence: resolverSequence,
  });

  this.browser.on("serviceUp", function (service) {
    service.ip = service.addresses[0];
    service.mac_address = service.txtRecord.MAC;

    const device = new SoundTouchAPI(service);
    self.addDevice(device);

    if (onDeviceUp) onDeviceUp(device);
  });

  this.browser.on("serviceDown", function (service) {
    self.deleteDevice(service);
    if (onDeviceDown) onDeviceDown(service);
  });

  this.browser.start();
};

SoundTouchDiscovery.prototype.stopSearching = function () {
  if (this.browser) {
    this.browser.stop();
  }
};

module.exports = new SoundTouchDiscovery();
