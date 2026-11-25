# clearview

A terminal-style dashboard for an Unraid homelab. Looks like k9s, runs in a browser tab.

- **Docker autodiscovery**: every container, its state and health, and a click to open its WebUI
- **Host stats**: CPU, memory, and per-disk usage for the array, cache and pools
- **Alerts**: firing alerts from Grafana
- **Plex**: live streams, transcodes, bandwidth, libraries, history and top stats (through Tautulli)
- **Links**: other devices on your network, with an up/down dot
- **Keyboard first**: `j/k`, `/` filter, `:` commands with tab completion, `?` help. Mouse and phones work too.

## Quick start (Unraid)

1. Clone this repo on the server, for example under `/mnt/user/appdata/clearview-src`.
2. Copy `.env.example` to `.env` and fill in what you have. Everything is optional.
3. Run:

   ```bash
   docker compose up -d --build
   ```

4. Open `http://<server>:7878`.

Optional: copy `config/clearview.example.yaml` to `/mnt/user/appdata/clearview/clearview.yaml` to add links and hide containers.

Prefer the Unraid UI? `unraid-template.xml` is a Docker template. It needs the image pushed to a registry first.

## How containers get their WebUI link

Resolved in this order:

1. `clearview.url` label, or an `overrides:` entry in `clearview.yaml`
2. Unraid's own `net.unraid.docker.webui` label. Anything installed from Community Apps already has it. `[IP]` and `[PORT:n]` are expanded. An explicitly empty label means "no WebUI".
3. The first published TCP port (prefers 80, 8080, 8000, 3000, ...; `https` for 443/8443)
4. The container's own LAN address on br0 or macvlan networks

`[IP]` becomes `HOST_IP` if set, otherwise the address you typed into the browser.

Container labels you can add: `clearview.name`, `clearview.url`, `clearview.icon`, `clearview.group`, `clearview.hide=true`.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `7878` | Listen port |
| `HOST_NAME` | OS hostname | Name in the header and tab title |
| `HOST_IP` | browser address | Fills `[IP]` in WebUI links |
| `DOCKER_HOST` | `/var/run/docker.sock` | Socket path or `tcp://host:2375` (socket proxy) |
| `DISKS_ROOT` | `/host/mnt` | Folder whose subfolders are shown as disks |
| `CONFIG_PATH` | `/config/clearview.yaml` | Optional YAML file (links, hide, overrides) |
| `TAUTULLI_URL`, `TAUTULLI_API_KEY` | unset | Enables Plex. Key: Tautulli, Settings, Web Interface |
| `GRAFANA_URL`, `GRAFANA_TOKEN` | unset | Enables alerts. Token: Grafana, Service accounts, Viewer role |
| `GRAFANA_PUBLIC_URL`, `TAUTULLI_PUBLIC_URL` | unset | Browser-reachable address, if different from the one the server uses |
| `CLEARVIEW_DEMO` | unset | `1` serves fake data for trying the UI |

A source with no config shows setup instructions in its own view. A failing source shows the error and keeps the last good data.

## Keys

| Key | Action |
|---|---|
| `j` `k` `↓` `↑` | move |
| `g` `G` | top, bottom |
| `ctrl-d` `ctrl-u` | half page |
| `enter` `o` or click | open WebUI in a new tab |
| `/` | filter (esc clears) |
| `:` | command: `home` `containers` `plex` `alerts` `disks` `links` `help` (tab completes) |
| `1`..`6` | jump to a view |
| `s` | cycle container sort: name, state, age |
| `?` | help |

## Development

Needs Node 22.

```bash
npm install
npm run dev:demo     # fake data, no Docker or Unraid needed
npm run dev          # real data from your local Docker
npm run typecheck
npm test
```

`dev` serves the UI on http://localhost:5173 (proxying `/api` to the server on 7878). `npm run build` produces `web/dist` and `server/dist`.

Layout: `shared/` API types, `server/src/sources/` one file per data source, `web/src/views/` one file per screen.

## Security

- Clearview has no login. Keep it on your LAN, or put it behind your reverse proxy's auth.
- Mounting `docker.sock` read-only does not make the Docker API read-only: anything that can reach the socket can control Docker. Clearview only lists and inspects containers. To remove that exposure, run [`tecnativa/docker-socket-proxy`](https://github.com/Tecnativa/docker-socket-proxy) with only `CONTAINERS=1` (and `EVENTS=1`) enabled, and set `DOCKER_HOST=tcp://socket-proxy:2375` instead of mounting the socket.
- API keys and tokens stay on the server. They are never sent to the browser and are stripped from error messages.

## Not built yet

Container start/stop and logs, per-container CPU and memory, disk temperatures and SMART, Unraid array state, pending (not yet firing) Grafana alerts.
