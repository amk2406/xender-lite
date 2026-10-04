const os = require('os');
class NetworkInfo {
    constructor() {
        this.networkInterfaces = os.networkInterfaces();
    }

    // Get all network interfaces
    getAllInterfaces() {
        const interfaces = [];
        for (const [name, details] of Object.entries(os.networkInterfaces())) {
            details.forEach(detail => {
                interfaces.push({
                    interface: name,
                    address: detail.address,
                    family: detail.family,
                    mac: detail.mac,
                    internal: detail.internal,
                    cidr: detail.cidr,
                    netmask: detail.netmask
                });
            });
        }
        return interfaces;
    }

    // Get IPv4 addresses only
    getIPv4Addresses() {
        const ipv4 = [];
        for (const [name, details] of Object.entries(os.networkInterfaces())) {
            details.forEach(detail => {
                if (detail.family === 'IPv4') {
                    ipv4.push({
                        interface: name,
                        address: detail.address,
                        mac: detail.mac,
                        internal: detail.internal
                    });
                }
            });
        }
        return ipv4;
    }

    // Get active (non-internal) interfaces
    getActiveInterfaces() {
        const active = [];
        for (const [name, details] of Object.entries(os.networkInterfaces())) {
            details.forEach(detail => {
                if (!detail.internal && detail.address && detail.address !== '127.0.0.1') {
                    active.push({
                        interface: name,
                        address: detail.address,
                        family: detail.family,
                        mac: detail.mac
                    });
                }
            });
        }
        return active;
    }

    // Get Wi-Fi/LAN interface details (typically starts with 'en', 'eth', 'wlan', 'Wi-Fi')
    getWirelessOrEthernet() {
        const interfaces = [];
        const commonNames = ['en0', 'en1', 'eth0', 'wlan0', 'Wi-Fi', 'Ethernet'];
        
        for (const [name, details] of Object.entries(os.networkInterfaces())) {
            if (commonNames.some(common => name.includes(common)) || !name.includes('Loopback')) {
                details.forEach(detail => {
                    if (detail.family === 'IPv4' && !detail.internal) {
                        interfaces.push({
                            interface: name,
                            address: detail.address,
                            mac: detail.mac,
                            netmask: detail.netmask
                        });
                    }
                });
            }
        }
        return interfaces;
    }

    // Get local IP address (first non-internal IPv4)
    getLocalIP() {
        for (const [name, details] of Object.entries(os.networkInterfaces())) {
            for (const detail of details) {
                if (detail && detail.family === 'IPv4'&& detail.address !== '127.0.0.1') {
                    return detail.address
                }
            }
        }
        return null
    }   

    // Get MAC address of first active interface
    getMACAddress() {
        for (const [name, details] of Object.entries(os.networkInterfaces())) {
            for (const detail of details) {
                if (!detail.internal && detail.mac !== '00:00:00:00:00:00') {
                    return {
                        interface: name,
                        mac: detail.mac
                    };
                }
            }
        }
        return null;
    }

    // Display all network information in formatted way
    displayAllInfo() {
        console.log('\n========== NETWORK INFORMATION ==========\n');
        
        console.log('Hostname:', os.hostname());
        console.log('Platform:', os.platform());
        console.log('OS Release:', os.release());
        
        console.log('\n--- Network Interfaces ---');
        const allInterfaces = this.getAllInterfaces();
        allInterfaces.forEach(iface => {
            console.log(`\n📡 ${iface.interface} (${iface.family})`);
            console.log(`   IP Address: ${iface.address}`);
            console.log(`   MAC: ${iface.mac}`);
            console.log(`   Internal: ${iface.internal}`);
        });
        
        console.log('\n--- Active Connections ---');
        const active = this.getActiveInterfaces();
        if (active.length > 0) {
            active.forEach(iface => {
                console.log(`✅ ${iface.interface}: ${iface.address}`);
            });
        } else {
            console.log('No active interfaces found');
        }
        
        console.log(`\n🌐 Local IP Address: ${this.getLocalIP()}`);
        
        const macInfo = this.getMACAddress();
        if (macInfo) {
            console.log(`🔌 MAC Address (${macInfo.interface}): ${macInfo.mac}`);
        }
        
        console.log('\n==========================================\n');
    }
}

// Usage examples
const network = new NetworkInfo();

// Export for use in other modules
module.exports = network;

