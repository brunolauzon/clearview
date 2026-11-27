#!/usr/bin/env python3
"""Show what UniFi Protect reports through its Integration API, before building on it.

    python3 scripts/protect-check.py https://192.168.1.1

It asks for the API key without echoing it. It prints the Protect version, device models, states,
detection types and counts only: no key, names, IP addresses, MAC addresses or IDs.
Like UNIFI_INSECURE=1, it accepts the console's self-signed certificate.
"""
import base64
import getpass
import http.client
import json
import os
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request

if len(sys.argv) != 2:
    sys.exit(__doc__)

base = sys.argv[1].rstrip("/") + "/proxy/protect/integration/v1"
key = os.environ.get("UNIFI_API_KEY") or getpass.getpass("UniFi API key (hidden): ").strip()
context = ssl._create_unverified_context()


def get(path):
    request = urllib.request.Request(base + path, headers={"X-API-KEY": key, "Accept": "application/json"})
    with urllib.request.urlopen(request, context=context, timeout=10) as response:
        return json.load(response)


def events_status():
    """Open the live event feed just far enough to see whether this key is allowed to."""
    url = urllib.parse.urlsplit(base + "/subscribe/events")
    if url.scheme == "https":
        connection = http.client.HTTPSConnection(url.netloc, context=context, timeout=10)
    else:
        connection = http.client.HTTPConnection(url.netloc, timeout=10)
    headers = {
        "X-API-KEY": key,
        "Connection": "Upgrade",
        "Upgrade": "websocket",
        "Sec-WebSocket-Version": "13",
        "Sec-WebSocket-Key": base64.b64encode(os.urandom(16)).decode(),
    }
    try:
        connection.request("GET", url.path, headers=headers)
        return connection.getresponse().status
    finally:
        connection.close()


try:
    print(f"protect version: {get('/meta/info').get('applicationVersion')}")
except urllib.error.HTTPError as error:
    sys.exit(f"HTTP {error.code} from Protect (401 or 403: this key is not accepted by Protect)")
except urllib.error.URLError as error:
    sys.exit(f"cannot connect: {error.reason}")
except json.JSONDecodeError:
    sys.exit("the answer was not JSON: check the address, and that Protect is installed on this console")

for kind in ("nvrs", "cameras", "sensors", "lights", "chimes"):
    try:
        found = get(f"/{kind}")
    except urllib.error.HTTPError as error:
        print(f"\n{kind}: HTTP {error.code}")
        continue
    items = found if isinstance(found, list) else [found]
    print(f"\n{kind}: {len(items)}")
    for item in items:
        line = f"  model={item.get('type')!r}"
        if "state" in item:
            line += f"  state={item.get('state')}"
        if kind == "nvrs":
            line += f"  arm={(item.get('armMode') or {}).get('status')}  fields={sorted(item)}"
        if kind == "cameras":
            smart = item.get("smartDetectSettings") or {}
            line += f"  detects={smart.get('objectTypes')}  fields={len(item)}"
        print(line)
    if kind == "cameras" and items:
        print(f"  camera fields: {sorted(items[0])}")

try:
    status = events_status()
    print(f"\nlive events: HTTP {status} ({'allowed' if status == 101 else 'not available'})")
except (OSError, http.client.HTTPException) as error:
    print(f"\nlive events: {error}")
