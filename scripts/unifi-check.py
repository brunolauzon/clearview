#!/usr/bin/env python3
"""Show what a UniFi console reports about its devices, to debug the network box.

    python3 scripts/unifi-check.py https://192.168.1.1

It asks for the API key without echoing it. It prints device models, states, features and
uplink rates only: no key, IP addresses, MAC addresses or device names.
Like UNIFI_INSECURE=1, it accepts the console's self-signed certificate.
"""
import getpass
import json
import os
import ssl
import sys
import urllib.error
import urllib.request

if len(sys.argv) != 2:
    sys.exit(__doc__)

base = sys.argv[1].rstrip("/") + "/proxy/network/integration/v1"
key = os.environ.get("UNIFI_API_KEY") or getpass.getpass("UniFi API key (hidden): ").strip()
context = ssl._create_unverified_context()


def get(path):
    request = urllib.request.Request(base + path, headers={"X-API-KEY": key, "Accept": "application/json"})
    with urllib.request.urlopen(request, context=context, timeout=10) as response:
        return json.load(response)


try:
    sites = get("/sites?limit=200").get("data", [])
except urllib.error.HTTPError as error:
    sys.exit(f"HTTP {error.code} listing sites")
except urllib.error.URLError as error:
    sys.exit(f"cannot connect: {error.reason}")

print(f"sites: {len(sites)}")
for number, site in enumerate(sites, 1):
    devices = get(f"/sites/{site['id']}/devices?limit=200").get("data", [])
    default = " (default)" if site.get("internalReference") == "default" else ""
    print(f"\nsite {number}{default}: {len(devices)} devices")
    for device in devices:
        print(f"  model={device.get('model')!r}  state={device.get('state')}  features={device.get('features')}")
        # only devices that could plausibly route are asked for statistics
        if device.get("features") != ["accessPoint"]:
            try:
                stats = get(f"/sites/{site['id']}/devices/{device['id']}/statistics/latest")
                print(f"      statistics keys={sorted(stats)}")
                print(f"      uplink={stats.get('uplink')}")
            except urllib.error.HTTPError as error:
                print(f"      statistics: HTTP {error.code}")
