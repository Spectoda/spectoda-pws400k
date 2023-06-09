"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SpectodaNodeBluetoothConnector = exports.NodeBLEConnection = void 0;
// @ts-nocheck
const index_1 = require("../node-ble/src/index");
const Logging_js_1 = require("./Logging.js");
const functions_js_1 = require("./functions.js");
const SpectodaInterfaceLegacy_js_1 = require("./SpectodaInterfaceLegacy.js");
const TimeTrack_js_1 = require("./TimeTrack.js");
const TnglReader_js_1 = require("./TnglReader.js");
const fs = require('fs');
// od 0.8.0 maji vsechny spectoda enabled BLE zarizeni jednotne SPECTODA_DEVICE_UUID.
// kazdy typ (produkt) Spectoda Zarizeni ma svuj kod v manufacturer data
// verze FW lze získat také z manufacturer data
// xxConnection.js udržuje komunikaci vždy pouze s
// jedním zařízením v jednu chvíli
//////////////////////////////////////////////////////////////////////////
// ESP Registered MAC address ranges used for device scanning 
const ESP_MAC_PREFIXES = ["08:3A:8D", "08:3A:F2", "08:B6:1F", "08:F9:E0", "0C:8B:95", "0C:B8:15", "0C:DC:7E", "10:52:1C", "10:91:A8", "10:97:BD", "18:FE:34", "1C:9D:C2", "24:0A:C4", "24:4C:AB", "24:62:AB", "24:6F:28", "24:A1:60", "24:B2:DE", "24:D7:EB", "24:DC:C3", "2C:3A:E8", "2C:F4:32", "30:83:98", "30:AE:A4", "30:C6:F7", "34:85:18", "34:86:5D", "34:94:54", "34:98:7A", "34:AB:95", "34:B4:72", "3C:61:05", "3C:71:BF", "3C:E9:0E", "40:22:D8", "40:4C:CA", "40:91:51", "40:F5:20", "44:17:93", "48:27:E2", "48:31:B7", "48:3F:DA", "48:55:19", "48:E7:29", "4C:11:AE", "4C:75:25", "4C:EB:D6", "50:02:91", "54:32:04", "54:43:B2", "54:5A:A6", "58:BF:25", "58:CF:79", "5C:CF:7F", "60:01:94", "60:55:F9", "64:B7:08", "64:E8:33", "68:67:25", "68:B6:B3", "68:C6:3A", "70:03:9F", "70:04:1D", "70:B8:F6", "78:21:84", "78:E3:6D", "7C:87:CE", "7C:9E:BD", "7C:DF:A1", "80:64:6F", "80:7D:3A", "84:0D:8E", "84:CC:A8", "84:F3:EB", "84:F7:03", "84:FC:E6", "8C:4B:14", "8C:AA:B5", "8C:CE:4E", "90:38:0C", "90:97:D5", "94:3C:C6", "94:B5:55", "94:B9:7E", "94:E6:86", "98:CD:AC", "98:F4:AB", "9C:9C:1F", "A0:20:A6", "A0:76:4E", "A0:A3:B3", "A0:B7:65", "A4:7B:9D", "A4:CF:12", "A4:E5:7C", "A8:03:2A", "A8:42:E3", "A8:48:FA", "AC:0B:FB", "AC:67:B2", "AC:D0:74", "B0:A7:32", "B0:B2:1C", "B4:8A:0A", "B4:E6:2D", "B8:D6:1A", "B8:F0:09", "BC:DD:C2", "BC:FF:4D", "C0:49:EF", "C0:4E:30", "C4:4F:33", "C4:5B:BE", "C4:DD:57", "C4:DE:E2", "C8:2B:96", "C8:C9:A3", "C8:F0:9E", "CC:50:E3", "CC:DB:A7", "D4:D4:DA", "D4:F9:8D", "D8:A0:1D", "D8:BF:C0", "D8:F1:5B", "DC:4F:22", "DC:54:75", "E0:5A:1B", "E0:98:06", "E0:E2:E6", "E8:31:CD", "E8:68:E7", "E8:9F:6D", "E8:DB:84", "EC:62:60", "EC:94:CB", "EC:DA:3B", "EC:FA:BC", "F0:08:D1", "F4:12:FA", "F4:CF:A2", "FC:F5:C4"];
/*
    is renamed Transmitter. Helper class for WebBluetoothConnector.js
*/
class NodeBLEConnection {
    #interfaceReference;
    // private fields
    #service;
    #networkChar;
    #clockChar;
    #deviceChar;
    #writing;
    #uuidCounter;
    constructor(interfaceReference) {
        this.#interfaceReference = interfaceReference;
        /*
          BLE Spectoda Service
        */
        this.#service = undefined;
        /*
          Network Characteristics governs the communication with the Spectoda Netwok.
          That means tngl uploads, timeline manipulation, event emitting...
          You can access it only if you are authenticated via the Device Characteristics
        */
        this.#networkChar = undefined; // ? only accesable when connected to the mesh network
        /*
          The whole purpuse of clock characteristics is to synchronize clock time
          of the application with the Spectoda network
        */
        this.#clockChar = undefined; // ? always accesable
        /*
          Device Characteristics is renamed Update Characteristics
          Device Characteristics handles ALL CONCEPTS WITH THE
          PHYSICAL CONNECTED DEVICE. On the other hand Network Characteristics
          handles concepts connected with the whole spectoda network - all devices
          With Device Charactristics you can upload FW to the single device,
          access and manipulate json config of the device, adopt device,
          and authenticate the application client with the spectoda network
        */
        this.#deviceChar = undefined;
        /*
          simple mutex indicating that communication over BLE is in progress
        */
        this.#writing = false;
        this.#uuidCounter = Math.floor(Math.random() * 4294967295);
    }
    #getUUID() {
        Logging_js_1.logging.verbose("#getUUID()");
        // valid UUIDs are in range [1..4294967295] (32 bit number)
        if (this.#uuidCounter >= 4294967295) {
            this.#uuidCounter = 0;
        }
        return ++this.#uuidCounter;
    }
    #writeBytes(characteristic, bytes, response) {
        Logging_js_1.logging.verbose("#writeBytes()", bytes, response);
        const write_uuid = this.#getUUID(); // two messages near to each other must not have the same UUID!
        const packet_header_size = 12; // 3x 4byte integers: write_uuid, index_from, payload.length
        const packet_size = 512; // min size packet_header_size + 1 !!!! ANDROID NEEDS PACKET SIZE <= 212!!!!
        const bytes_size = packet_size - packet_header_size;
        if (!response) {
            if (bytes.length > bytes_size) {
                Logging_js_1.logging.error("The maximum bytes that can be written without response is " + bytes_size);
                return Promise.reject("WriteError");
            }
            const payload = [...(0, functions_js_1.numberToBytes)(write_uuid, 4), ...(0, functions_js_1.numberToBytes)(0, 4), ...(0, functions_js_1.numberToBytes)(bytes.length, 4), ...bytes.slice(0, bytes.length)];
            return characteristic.writeValue(Buffer.from(payload), { offset: 0, type: "command" });
        }
        return new Promise(async (resolve, reject) => {
            let index_from = 0;
            let index_to = bytes_size;
            while (index_from < bytes.length) {
                if (index_to > bytes.length) {
                    index_to = bytes.length;
                }
                const payload = [...(0, functions_js_1.numberToBytes)(write_uuid, 4), ...(0, functions_js_1.numberToBytes)(index_from, 4), ...(0, functions_js_1.numberToBytes)(bytes.length, 4), ...bytes.slice(index_from, index_to)];
                try {
                    await characteristic.writeValue(Buffer.from(payload), { offset: 0, type: "request" });
                }
                catch (e) {
                    Logging_js_1.logging.warn(e);
                    reject(e);
                    return;
                }
                index_from += bytes_size;
                index_to = index_from + bytes_size;
            }
            resolve();
            return;
        });
    }
    #readBytes(characteristic) {
        Logging_js_1.logging.debug("#readBytes()");
        // read the requested value
        // TODO write this function effectivelly
        return new Promise(async (resolve, reject) => {
            let value = undefined;
            let bytes = undefined;
            let total_bytes = [];
            do {
                try {
                    value = await characteristic.readValue();
                    Logging_js_1.logging.debug("value", value);
                }
                catch (e) {
                    Logging_js_1.logging.warn(e);
                    reject(e);
                    return;
                }
                bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
                Logging_js_1.logging.debug("bytes", bytes);
                total_bytes = [...total_bytes, ...bytes];
                Logging_js_1.logging.debug("total_bytes", total_bytes);
            } while (bytes.length == 512);
            resolve(new DataView(new Uint8Array(total_bytes).buffer));
            return;
        });
    }
    // WIP, event handling from spectoda network to application
    // timeline changes from spectoda network to application ...
    #onNetworkNotification(data) {
        Logging_js_1.logging.verbose("onNetworkNotification()", data);
        // logging.warn(event);
        // const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        // logging.verbose("bytes", bytes);
        // logging.verbose("view", view);
        this.#interfaceReference.process(view);
    }
    // WIP
    #onDeviceNotification(data) {
        Logging_js_1.logging.verbose("onDeviceNotification()", data);
        // logging.warn(event);
    }
    // WIP
    #onClockNotification(data) {
        Logging_js_1.logging.verbose("onClockNotification()", data);
        // logging.warn(event);
    }
    attach(service, networkUUID, clockUUID, deviceUUID) {
        Logging_js_1.logging.verbose("attach()", service, networkUUID, clockUUID, deviceUUID);
        this.#service = service;
        Logging_js_1.logging.info("> Getting Network Characteristics...");
        return this.#service
            .getCharacteristic(networkUUID)
            .then(characteristic => {
            Logging_js_1.logging.verbose("#networkChar", characteristic);
            this.#networkChar = characteristic;
            return this.#networkChar.startNotifications()
                .then(() => {
                Logging_js_1.logging.info("> Network notifications started");
                this.#networkChar?.on("valuechanged", event => {
                    this.#onNetworkNotification(event);
                });
            })
                .catch(e => {
                Logging_js_1.logging.info("> Network notifications failed");
                Logging_js_1.logging.warn(e);
            });
        })
            .catch(e => {
            Logging_js_1.logging.warn(e);
            throw "ConnectionFailed";
        })
            .then(() => {
            Logging_js_1.logging.info("> Getting Clock Characteristics...");
            return this.#service?.getCharacteristic(clockUUID);
        })
            .then(characteristic => {
            Logging_js_1.logging.verbose("#clockChar", characteristic);
            this.#clockChar = characteristic;
            return this.#clockChar?.startNotifications()
                .then(() => {
                Logging_js_1.logging.info("> Clock notifications started");
                this.#clockChar?.on("valuechanged", event => {
                    this.#onClockNotification(event);
                });
            })
                .catch(e => {
                Logging_js_1.logging.info("> Clock notifications failed");
                Logging_js_1.logging.warn(e);
            });
        })
            .catch(e => {
            Logging_js_1.logging.warn(e);
            throw "ConnectionFailed";
        })
            .then(() => {
            Logging_js_1.logging.info("> Getting Device Characteristics...");
            return this.#service?.getCharacteristic(deviceUUID);
        })
            .then(characteristic => {
            Logging_js_1.logging.verbose("#deviceChar", characteristic);
            this.#deviceChar = characteristic;
            return this.#deviceChar?.startNotifications()
                .then(() => {
                Logging_js_1.logging.info("> Device notifications started");
                this.#deviceChar?.on("valuechanged", event => {
                    this.#onDeviceNotification(event);
                });
            })
                .catch(e => {
                Logging_js_1.logging.info("> Device notifications failed");
                Logging_js_1.logging.warn(e);
            });
        })
            .catch(e => {
            Logging_js_1.logging.warn(e);
            throw "ConnectionFailed";
        });
    }
    // deliver() thansfers data reliably to the Bluetooth Device. It might not be instant.
    // It may even take ages to get to the device, but it will! (in theory)
    // returns promise that resolves when message is physically send, but you
    // dont need to wait for it to resolve, and spam deliver() as you please.
    // transmering queue will handle it
    deliver(payload, timeout) {
        Logging_js_1.logging.verbose("deliver()", payload, timeout);
        if (!this.#networkChar) {
            Logging_js_1.logging.warn("Network characteristics is null");
            return Promise.reject("DeliverFailed");
        }
        if (this.#writing) {
            Logging_js_1.logging.warn("Communication in proccess");
            return Promise.reject("DeliverFailed");
        }
        this.#writing = true;
        return this.#writeBytes(this.#networkChar, payload, true)
            .catch(e => {
            Logging_js_1.logging.error(e);
            throw "DeliverFailed";
        })
            .finally(() => {
            this.#writing = false;
        });
    }
    // transmit() tryes to transmit data NOW. ASAP. It will fail,
    // if deliver or another transmit is being executed at the moment
    // returns promise that will be resolved when message is physically send (only transmittion, not receive)
    transmit(payload, timeout) {
        Logging_js_1.logging.verbose("transmit()", payload, timeout);
        if (!this.#networkChar) {
            Logging_js_1.logging.warn("Network characteristics is null");
            return Promise.reject("TransmitFailed");
        }
        if (this.#writing) {
            Logging_js_1.logging.warn("Communication in proccess");
            return Promise.reject("TransmitFailed");
        }
        this.#writing = true;
        return this.#writeBytes(this.#networkChar, payload, false)
            .catch(e => {
            Logging_js_1.logging.error(e);
            throw "TransmitFailed";
        })
            .finally(() => {
            this.#writing = false;
        });
    }
    // request first writes the request to the Device Characteristics
    // and then reads the response also from the Device Characteristics
    request(payload, read_response, timeout) {
        Logging_js_1.logging.verbose("request()", payload, read_response, timeout);
        if (!this.#deviceChar) {
            Logging_js_1.logging.warn("Device characteristics is null");
            return Promise.reject("RequestFailed");
        }
        if (this.#writing) {
            Logging_js_1.logging.warn("Communication in proccess");
            return Promise.reject("RequestFailed");
        }
        this.#writing = true;
        return this.#writeBytes(this.#deviceChar, payload, true)
            .then(() => {
            if (!read_response) {
                return;
            }
            if (!this.#deviceChar) {
                return;
            }
            return this.#readBytes(this.#deviceChar);
        })
            .catch(e => {
            Logging_js_1.logging.error(e);
            throw "RequestFailed";
        })
            .finally(() => {
            this.#writing = false;
        });
    }
    // write timestamp to clock characteristics as fast as possible
    writeClock(timestamp) {
        Logging_js_1.logging.verbose("writeClock()", timestamp);
        if (!this.#clockChar) {
            Logging_js_1.logging.warn("Sync characteristics is null");
            return Promise.reject("ClockWriteFailed");
        }
        if (this.#writing) {
            Logging_js_1.logging.warn("Communication in proccess");
            return Promise.reject("ClockWriteFailed");
        }
        this.#writing = true;
        const bytes = Buffer.from((0, functions_js_1.toBytes)(timestamp, 8));
        return this.#clockChar
            .writeValue(bytes, { offset: 0, type: "reliable" })
            .catch(e => {
            Logging_js_1.logging.error(e);
            throw "ClockWriteFailed";
        })
            .finally(() => {
            this.#writing = false;
        });
    }
    // reads the current clock characteristics timestamp from the device
    // as fast as possible
    readClock() {
        Logging_js_1.logging.verbose("readClock()");
        if (!this.#clockChar) {
            Logging_js_1.logging.warn("Sync characteristics is null");
            return Promise.reject("ClockReadFailed");
        }
        if (this.#writing) {
            Logging_js_1.logging.warn("Communication in proccess");
            return Promise.reject("ClockReadFailed");
        }
        this.#writing = true;
        return this.#readBytes(this.#clockChar)
            .then(dataView => {
            Logging_js_1.logging.debug(dataView);
            let reader = new TnglReader_js_1.TnglReader(dataView);
            return reader.readUint64();
        })
            .catch(e => {
            Logging_js_1.logging.error(e);
            throw "ClockReadFailed";
        })
            .finally(() => {
            this.#writing = false;
        });
    }
    async updateFirmware(firmware) {
        Logging_js_1.logging.verbose("updateFirmware()", firmware);
        if (!this.#deviceChar) {
            Logging_js_1.logging.warn("Device characteristics is null");
            return Promise.reject("UpdateFailed");
        }
        if (this.#writing) {
            Logging_js_1.logging.warn("Communication in proccess");
            return Promise.reject("UpdateFailed");
        }
        this.#writing = true;
        const chunk_size = 4992; // must be modulo 16
        let index_from = 0;
        let index_to = chunk_size;
        let written = 0;
        Logging_js_1.logging.debug("OTA UPDATE");
        Logging_js_1.logging.debug(firmware);
        const start_timestamp = new Date().getTime();
        try {
            this.#interfaceReference.emit("ota_status", "begin");
            {
                //===========// RESET //===========//
                Logging_js_1.logging.debug("OTA RESET");
                const bytes = new Uint8Array([SpectodaInterfaceLegacy_js_1.COMMAND_FLAGS.FLAG_OTA_RESET, 0x00, ...(0, functions_js_1.numberToBytes)(0x00000000, 4)]);
                await this.#writeBytes(this.#deviceChar, bytes, true);
            }
            await (0, functions_js_1.sleep)(100);
            {
                //===========// BEGIN //===========//
                Logging_js_1.logging.debug("OTA BEGIN");
                const bytes = new Uint8Array([SpectodaInterfaceLegacy_js_1.COMMAND_FLAGS.FLAG_OTA_BEGIN, 0x00, ...(0, functions_js_1.numberToBytes)(firmware.length, 4)]);
                await this.#writeBytes(this.#deviceChar, bytes, true);
            }
            await (0, functions_js_1.sleep)(8000); // need to wait 10 seconds to let the ESP erase the flash.
            {
                //===========// WRITE //===========//
                Logging_js_1.logging.debug("OTA WRITE");
                while (written < firmware.length) {
                    if (index_to > firmware.length) {
                        index_to = firmware.length;
                    }
                    const bytes = new Uint8Array([SpectodaInterfaceLegacy_js_1.COMMAND_FLAGS.FLAG_OTA_WRITE, 0x00, ...(0, functions_js_1.numberToBytes)(written, 4), ...firmware.slice(index_from, index_to)]);
                    await this.#writeBytes(this.#deviceChar, bytes, true);
                    written += index_to - index_from;
                    const percentage = Math.floor((written * 10000) / firmware.length) / 100;
                    Logging_js_1.logging.debug(percentage + "%");
                    this.#interfaceReference.emit("ota_progress", percentage);
                    index_from += chunk_size;
                    index_to = index_from + chunk_size;
                }
            }
            await (0, functions_js_1.sleep)(100);
            {
                //===========// END //===========//
                Logging_js_1.logging.debug("OTA END");
                const bytes = new Uint8Array([SpectodaInterfaceLegacy_js_1.COMMAND_FLAGS.FLAG_OTA_END, 0x00, ...(0, functions_js_1.numberToBytes)(written, 4)]);
                await this.#writeBytes(this.#deviceChar, bytes, true);
            }
            await (0, functions_js_1.sleep)(2000);
            Logging_js_1.logging.info("Firmware written in " + (new Date().getTime() - start_timestamp) / 1000 + " seconds");
            this.#interfaceReference.emit("ota_status", "success");
            return;
        }
        catch (e) {
            Logging_js_1.logging.error(e);
            this.#interfaceReference.emit("ota_status", "fail");
            throw "UpdateFailed";
        }
        finally {
            this.#writing = false;
        }
    }
    // resets the Communations, discarding command queue
    reset() {
        Logging_js_1.logging.verbose("reset()");
        this.#networkChar?.stopNotifications();
        this.#networkChar?.removeAllListeners("valuechanged");
        this.#clockChar?.stopNotifications();
        this.#clockChar?.removeAllListeners("valuechanged");
        this.#deviceChar?.stopNotifications();
        this.#deviceChar?.removeAllListeners("valuechanged");
        this.#service = undefined;
        this.#networkChar = undefined;
        this.#clockChar = undefined;
        this.#deviceChar = undefined;
        this.#service = undefined;
        this.#writing = false;
    }
    destroy() {
        Logging_js_1.logging.verbose("destroy()");
        this.reset();
    }
}
exports.NodeBLEConnection = NodeBLEConnection;
class SpectodaNodeBluetoothConnector {
    type = "nodebluetooth";
    SPECTODA_SERVICE_UUID = "cc540e31-80be-44af-b64a-5d2def886bf5";
    TERMINAL_CHAR_UUID = "33a0937e-0c61-41ea-b770-007ade2c79fa";
    CLOCK_CHAR_UUID = "7a1e0e3a-6b9b-49ef-b9b7-65c81b714a19";
    DEVICE_CHAR_UUID = "9ebe2e4b-10c7-4a81-ac83-49540d1135a5";
    #interfaceReference;
    #bluetooth;
    #bluetoothDestroy;
    #bluetoothAdapter;
    #bluetoothDevice;
    #connection;
    #reconection;
    #criteria;
    #connectedGuard;
    constructor(interfaceReference) {
        this.#interfaceReference = interfaceReference;
        const { bluetooth: bluetoothDevice, destroy: bluetoothDestroy } = (0, index_1.createBluetooth)();
        this.#bluetooth = bluetoothDevice;
        this.#bluetoothDestroy = bluetoothDestroy;
        this.#bluetoothAdapter = undefined;
        this.#bluetoothDevice = undefined;
        this.#connection = new NodeBLEConnection(interfaceReference);
        this.#reconection = false;
        this.#criteria = {};
        this.#connectedGuard = false;
        this.#interfaceReference.on("#connected", () => {
            this.#connectedGuard = true;
        });
        this.#interfaceReference.on("#disconnected", () => {
            this.#connectedGuard = false;
        });
    }
    /*
  
  criteria: pole objektu, kde plati: [{ tohle and tamto and toto } or { tohle and tamto }]
  
  možnosti:
    name: string
    namePrefix: string
    fwVersion: string
    ownerSignature: string
    productCode: number
    adoptionFlag: bool
  
  criteria example:
  [
    // selects also legacy devices
    {
      legacy:true
    }
    // all Devices that are named "NARA Aplha", are on 0.8.0 fw and are
    // adopted by the owner with "baf2398ff5e6a7b8c9d097d54a9f865f" signature.
    // Product code is 1 what means NARA Alpha
    {
      name:"NARA Alpha"
      fwVersion:"0.8.0"
      ownerSignature:"baf2398ff5e6a7b8c9d097d54a9f865f"
      productCode:1
    },
    // all the devices with the name starting with "NARA", without the 0.8.0 FW and
    // that are not adopted by anyone
    // Product code is 2 what means NARA Beta
    {
      namePrefix:"NARA"
      fwVersion:"!0.8.0"
      productCode:2
      adoptionFlag:true
    }
  ]
  
  */
    // choose one Spectoda device (user chooses which device to connect to via a popup)
    // if no criteria are set, then show all Spectoda devices visible.
    // first bonds the BLE device with the PC/Phone/Tablet if it is needed.
    // Then selects the device
    userSelect(criteria, timeout) {
        Logging_js_1.logging.debug("userSelect()", criteria, timeout);
        throw "NotImplemented";
    }
    // takes the criteria, scans for scanPeriod and automatically selects the device,
    // you can then connect to. This works only for BLE devices that are bond with the phone/PC/tablet
    // the app is running on OR doesnt need to be bonded in a special way.
    // if more devices are found matching the criteria, then the strongest signal wins
    // if no device is found within the timeout period, then it returns an error
    // if no criteria are provided, all Spectoda enabled devices (with all different FWs and Owners and such)
    // are eligible.
    async autoSelect(criteria, scanPeriod, timeout) {
        Logging_js_1.logging.debug("autoSelect()", criteria, scanPeriod, timeout);
        try {
            // step 1. for the scanPeriod scan the surroundings for BLE devices.
            // step 2. if some devices matching the criteria are found, then select the one with
            //         the greatest signal strength. If no device is found until the timeout,
            //         then return error
            if (!criteria || criteria.length < 1 || typeof criteria[0]?.mac !== "string") {
                Logging_js_1.logging.error("Criteria must be an array of at least 1 object with specified MAC address: [{mac:'AA:BB:CC:DD:EE:FF'}]");
                throw "CriteriaNotSupported";
            }
            this.#criteria = criteria;
            if (await this.connected()) {
                Logging_js_1.logging.verbose("> Disconnecting device");
                await this.disconnect().catch(e => Logging_js_1.logging.error(e));
                await (0, functions_js_1.sleep)(1000);
            }
            if (!this.#bluetoothAdapter) {
                Logging_js_1.logging.verbose("> Requesting default bluetooth adapter");
                this.#bluetoothAdapter = await this.#bluetooth.defaultAdapter();
            }
            if (!await this.#bluetoothAdapter.isDiscovering()) {
                Logging_js_1.logging.info("> Starting BLE scanner");
                await this.#bluetoothAdapter.startDiscovery();
            }
            else {
                Logging_js_1.logging.info("> Restarting BLE scanner");
                await this.#bluetoothAdapter.stopDiscovery();
                await this.#bluetoothAdapter.startDiscovery();
            }
            // Device UUID === Device MAC address
            const deviceMacAddress = criteria[0].mac.toUpperCase();
            this.#bluetoothDevice?.removeAllListeners("connect");
            this.#bluetoothDevice?.removeAllListeners("disconnect");
            Logging_js_1.logging.debug(`> Waiting for the device ${deviceMacAddress} to show up`);
            this.#bluetoothDevice = await this.#bluetoothAdapter.waitDevice(deviceMacAddress, timeout, scanPeriod);
            await (0, functions_js_1.sleep)(100);
            Logging_js_1.logging.info("> Getting BLE device mac address");
            const mac = await this.#bluetoothDevice.getAddress().catch(e => console.error(e));
            Logging_js_1.logging.info("> Getting BLE device name");
            const name = await this.#bluetoothDevice.getName().catch(e => console.error(e));
            // logging.verbose("stopping scanner");
            // await this.#bluetoothAdapter.stopDiscovery();
            this.#bluetoothDevice.on("connect", this.#onConnected);
            this.#bluetoothDevice.on("disconnect", this.#onDisconnected);
            return {
                connector: this.type,
                mac: mac,
                name: name
            };
        }
        catch (e) {
            Logging_js_1.logging.warn(e);
            throw "SelectionFailed";
        }
    }
    // if device is conneced, then disconnect it
    async unselect() {
        Logging_js_1.logging.debug("unselect()");
        ƒ;
        if (await this.connected()) {
            await this.disconnect();
        }
        this.#bluetoothDevice?.removeAllListeners("disconnect");
        this.#bluetoothDevice = undefined;
        this.#connection.reset();
    }
    // // #selected returns boolean if a device is selected
    // #selected() {
    //   return Promise.resolve(this.#bluetoothDevice ? true : false);
    // }
    async selected() {
        Logging_js_1.logging.debug("selected()");
        if (!this.#bluetoothDevice) {
            return null;
        }
        Logging_js_1.logging.info("> Getting BLE device mac address");
        const mac = await this.#bluetoothDevice.getAddress().catch(e => console.error(e));
        Logging_js_1.logging.info("> Getting BLE device name");
        const name = await this.#bluetoothDevice.getName().catch(e => console.error(e));
        return {
            connector: this.type,
            mac: mac,
            name: name
        };
    }
    //
    async scan(criteria, scanPeriod = 10000) {
        Logging_js_1.logging.debug("scan()", criteria, scanPeriod);
        try {
            // if (!criteria || criteria.length != 1 || typeof criteria[0]?.mac !== "string") {
            //   logging.error("Criteria must be an array of 1 object with specified MAC address: [{mac:'AA:BB:CC:DD:EE:FF'}]");
            //   throw "CriteriaNotSupported";
            // }
            // this.#criteria = criteria;
            if (await this.connected()) {
                Logging_js_1.logging.info("> Disconnecting device");
                await this.disconnect().catch(e => Logging_js_1.logging.error(e));
                await (0, functions_js_1.sleep)(1000);
            }
            if (!this.#bluetoothAdapter) {
                Logging_js_1.logging.info("> Requesting default bluetooth adapter");
                this.#bluetoothAdapter = await this.#bluetooth.defaultAdapter();
            }
            if (!await this.#bluetoothAdapter.isDiscovering()) {
                Logging_js_1.logging.info("> Starting BLE scanner");
                await this.#bluetoothAdapter.startDiscovery();
            }
            else {
                Logging_js_1.logging.info("> Restarting BLE scanner");
                await this.#bluetoothAdapter.stopDiscovery();
                await this.#bluetoothAdapter.startDiscovery();
            }
            await (0, functions_js_1.sleep)(scanPeriod);
            const devices = await this.#bluetoothAdapter.devices();
            Logging_js_1.logging.info("> Devices Scanned:", devices);
            let eligibleControllersFound = [];
            for (const mac of devices) {
                if (!ESP_MAC_PREFIXES.some(prefix => mac.startsWith(prefix))) {
                    continue;
                }
                try {
                    const device = await this.#bluetoothAdapter.getDevice(mac);
                    const name = await device.getName();
                    // const rssi = await device.getRSSI(); // Seems like RSSI is not available in dbus
                    // const gatt = await device.gatt(); // Seems like this function freezes
                    const found_in_criteria = criteria.some(criterium => criterium.name === name);
                    const found_empty_criteria = criteria.some(criterium => Object.keys(criterium).length === 0);
                    if (found_in_criteria || found_empty_criteria) {
                        eligibleControllersFound.push({
                            connector: this.type,
                            mac: mac,
                            name: name,
                            // rssi: rssi
                        });
                    }
                }
                catch (e) {
                    console.error(e);
                }
            }
            // eligibleControllersFound.sort((a, b) => a.rssi - b.rssi);
            Logging_js_1.logging.info("Controlles Found:", eligibleControllersFound);
            return eligibleControllersFound;
        }
        catch (e) {
            Logging_js_1.logging.error(e);
            throw "ScanFailed";
        }
    }
    // connect Connector to the selected Spectoda Device. Also can be used to reconnect.
    // Fails if no device is selected
    async connect(timeout = 60000) {
        Logging_js_1.logging.debug(`connect(timeout=${timeout}})`);
        // await sleep(5000);
        if (timeout <= 0) {
            Logging_js_1.logging.info("> Connect timeout have expired");
            return Promise.reject("ConnectionFailed");
        }
        const start = new Date().getTime();
        this.#reconection = true;
        if (!this.#bluetoothDevice) {
            return Promise.reject("DeviceNotSelected");
        }
        // const alreadyConnected = await this.connected();
        // if (!alreadyConnected) {
        //   logging.info("> Connecting to Bluetooth device...");
        //   try {
        //     // const paired = await this.#bluetoothDevice.isPaired();
        //     // if (paired) {
        //     await this.#bluetoothDevice.connect()
        //     // } else {
        //     //   await this.#bluetoothDevice.pair()
        //     // }
        //   }
        //   catch (e) {
        //     logging.error(e);
        //     throw "ConnectionFailed";
        //   }
        // }
        await this.#bluetoothDevice.disconnect().catch(e => Logging_js_1.logging.error(e));
        Logging_js_1.logging.info("> Connecting to Bluetooth device...");
        await this.#bluetoothDevice.connect().catch(e => { Logging_js_1.logging.error(e); throw "ConnectionFailed"; });
        Logging_js_1.logging.info("> Getting the GATT server...");
        return this.#bluetoothDevice.gatt()
            .then(server => {
            this.#connection.reset();
            if (!server) {
                throw "Error";
            }
            Logging_js_1.logging.info("> Getting the Bluetooth Service...");
            return server.getPrimaryService(this.SPECTODA_SERVICE_UUID);
        })
            .then(service => {
            if (!service) {
                throw "Error";
            }
            Logging_js_1.logging.info("> Getting the Service Characteristic...");
            return this.#connection.attach(service, this.TERMINAL_CHAR_UUID, this.CLOCK_CHAR_UUID, this.DEVICE_CHAR_UUID);
        })
            .then(() => {
            Logging_js_1.logging.info("> Bluetooth Device Connected");
            if (!this.#connectedGuard) {
                this.#interfaceReference.emit("#connected");
            }
            return { connector: this.type };
        })
            .catch(error => {
            Logging_js_1.logging.warn(error);
            throw "ConnectionFailed";
        });
    }
    // there #connected returns boolean true if connected, false if not connected
    #connected() {
        Logging_js_1.logging.debug("#connected()");
        return this.#connectedGuard;
    }
    // connected() is an interface function that needs to return a Promise
    connected() {
        Logging_js_1.logging.debug("connected()");
        if (!this.#bluetoothDevice) {
            return Promise.resolve(null);
        }
        return this.#bluetoothDevice.isConnected().then(connected => Promise.resolve(connected ? { connector: this.type } : null));
    }
    #disconnect() {
        Logging_js_1.logging.debug("#disconnect()");
        return this.#bluetoothDevice?.disconnect().then(() => this.#onDisconnected());
    }
    // disconnect Connector from the connected Spectoda Device. But keep it selected
    async disconnect() {
        Logging_js_1.logging.debug("disconnect()");
        this.#reconection = false;
        Logging_js_1.logging.info("> Disconnecting from Bluetooth Device...");
        this.#connection.reset();
        if (await this.#connected()) {
            await this.#disconnect();
        }
        else {
            Logging_js_1.logging.debug("Bluetooth Device is already disconnected");
        }
    }
    // when the device is disconnected, the javascript Connector.js layer decides
    // if it should be revonnected. Here is implemented that it should be
    // reconnected only if the this.#reconection is true. The event handlers are fired
    // synchronously. So that only after all event handlers (one after the other) are done,
    // only then start this.connect() to reconnect to the bluetooth device
    #onDisconnected = () => {
        Logging_js_1.logging.info("> NodeBLE Device disconnected");
        this.#connection.reset();
        if (this.#connectedGuard) {
            Logging_js_1.logging.verbose("emitting #disconnected");
            this.#interfaceReference.emit("#disconnected");
        }
    };
    // when the device is disconnected, the javascript Connector.js layer decides
    // if it should be revonnected. Here is implemented that it should be
    // reconnected only if the this.#reconection is true. The event handlers are fired
    // synchronously. So that only after all event handlers (one after the other) are done,
    // only then start this.connect() to reconnect to the bluetooth device
    #onConnected = () => {
        Logging_js_1.logging.info("> NodeBLE Device Connected");
        if (!this.#connectedGuard) {
            Logging_js_1.logging.verbose("emitting #connected");
            this.#interfaceReference.emit("#connected");
        }
    };
    // deliver handles the communication with the Spectoda network in a way
    // that the command is guaranteed to arrive
    deliver(payload, timeout) {
        Logging_js_1.logging.debug("deliver()", payload, timeout);
        if (!this.#connected()) {
            return Promise.reject("DeviceDisconnected");
        }
        return this.#connection.deliver(payload, timeout);
    }
    // transmit handles the communication with the Spectoda network in a way
    // that the command is NOT guaranteed to arrive
    transmit(payload, timeout) {
        Logging_js_1.logging.debug("transmit()", payload, timeout);
        if (!this.#connected()) {
            return Promise.reject("DeviceDisconnected");
        }
        return this.#connection.transmit(payload, timeout);
    }
    // request handles the requests on the Spectoda network. The command request
    // is guaranteed to get a response
    request(payload, read_response, timeout) {
        Logging_js_1.logging.debug("request()", payload, read_response, timeout);
        if (!this.#connected()) {
            return Promise.reject("DeviceDisconnected");
        }
        return this.#connection.request(payload, read_response, timeout);
    }
    // synchronizes the device internal clock with the provided TimeTrack clock
    // of the application as precisely as possible
    setClock(clock) {
        Logging_js_1.logging.debug("setClock()", clock);
        if (!this.#connected()) {
            return Promise.reject("DeviceDisconnected");
        }
        return new Promise(async (resolve, reject) => {
            for (let index = 0; index < 3; index++) {
                try {
                    await this.#connection.writeClock(clock.millis());
                    Logging_js_1.logging.debug("Clock write success");
                    resolve();
                    return;
                }
                catch (e) {
                    Logging_js_1.logging.warn("Clock write failed");
                    await (0, functions_js_1.sleep)(1000);
                }
            }
            reject("ClockWriteFailed");
            return;
        });
    }
    // returns a TimeTrack clock object that is synchronized with the internal clock
    // of the device as precisely as possible
    getClock() {
        Logging_js_1.logging.debug("getClock()");
        if (!this.#connected()) {
            return Promise.reject("DeviceDisconnected");
        }
        return new Promise(async (resolve, reject) => {
            for (let index = 0; index < 3; index++) {
                await (0, functions_js_1.sleep)(1000);
                try {
                    const timestamp = await this.#connection.readClock();
                    Logging_js_1.logging.debug("Clock read success:", timestamp);
                    resolve(new TimeTrack_js_1.TimeTrack(timestamp));
                    return;
                }
                catch (e) {
                    Logging_js_1.logging.warn("Clock read failed:", e);
                }
            }
            reject("ClockReadFailed");
            return;
        });
    }
    // handles the firmware updating. Sends "ota" events
    // to all handlers
    updateFW(firmware) {
        Logging_js_1.logging.debug("updateFW()", firmware);
        if (!this.#connected()) {
            return Promise.reject("DeviceDisconnected");
        }
        return this.#connection.updateFirmware(firmware);
    }
    destroy() {
        Logging_js_1.logging.debug("destroy()");
        //this.#interfaceReference = null; // dont know if I need to destroy this reference.. But I guess I dont need to?
        return this.disconnect()
            .catch(() => { })
            .then(() => {
            return this.unselect();
        })
            .catch(() => { })
            .finally(() => {
            this.#bluetoothDestroy();
        });
    }
}
exports.SpectodaNodeBluetoothConnector = SpectodaNodeBluetoothConnector;
