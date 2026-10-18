# Care, Heard

A static personal blog and community-site prototype about patient experiences, care and the policies around it.

The Care, Heard green palette is the default. Use **Use red attention palette** in the main navigation when the bolder BrickWorks red, black and gold palette is wanted; choose **Return to green palette** to switch back. The selection is saved in the browser and carries across pages.

## Cloudflare Worker deployment

The site is prepared to deploy to the existing Cloudflare Worker named `help-with-kch`. `wrangler.jsonc` uploads the static website assets together with `worker.js`; the Worker returns HTTP 403 for requests Cloudflare geolocates to the US and serves the site to other visitors. `.assetsignore` limits public uploads to the site pages, stylesheet and script.

To deploy automatically from GitHub, connect the existing Worker to this repository:

1. In Cloudflare, open **Workers & Pages → help-with-kch → Settings → Builds → Connect**.
2. Select the GitHub repository `helpwithkch/Brickworks-Template` and production branch `main`.
3. Set the root directory to the repository root (or leave it blank), leave the build command empty, and use the default deploy command `npx wrangler deploy`.
4. Before saving, confirm the Worker configuration name in `wrangler.jsonc` matches `help-with-kch`. Cloudflare requires this exact name to deploy from Git.
5. Run the build/deployment. Once it succeeds, visit `https://help-with-kch.co.uk` and check the home page, styling, navigation and community form.

The custom domain is attached to the existing Worker, not defined as a Wrangler route in this repository. Deploy to that same Worker; do not create a replacement Worker or change **Settings → Domains & Routes**. A deployment updates the Worker's code/assets while keeping its domain association. If the `www` hostname is also attached to it, test that hostname too.

For a safer first test, push a non-production branch and use Cloudflare's Worker preview build before deploying `main`. To roll back a bad deployment, use the Worker **Deployments / Version history** to promote its previous working version.

IP geolocation is approximate: VPNs, proxies and network routing can affect the country Cloudflare detects. The restriction is not a guarantee that every US-based visitor can be identified or blocked.

## Pages

- `index.html` — the author's journal and an introduction to the community.
- `about.html` — the purpose and principles of the site.
- `services.html` — the guest-story form and community space.
- `css/site.css` — responsive styles.
- `js/site.js` — mobile navigation, blog audio controls and the guest-form prototype.
- `worker.js` — Cloudflare Worker that enforces the country restriction and serves static assets.
- `wrangler.jsonc` — Wrangler configuration for the existing `help-with-kch` Worker.
- `.assetsignore` — allowlist of website files uploaded as public assets.

## Blog audio

Each journal post has a **Listen to text** button that uses the browser's built-in speech synthesis, and a **Choose voice recording** file picker with an audio player. The file picker plays a recording locally in the visitor's browser; it does not upload the audio. Add supplied recordings to a hosted site separately if visitors should all hear the same audio without choosing a local file.

## Guest-story prototype

The community form accepts one post of up to 500 words per browser. Posts use a display name and are saved to that browser's local storage. There is no server, real account registration, moderation workflow or cross-visitor sharing in this static version. A real community site needs a server-side account and submission system, secure storage, and moderation before guest stories can be shared publicly.

The form intentionally does not request email addresses or passwords. Visitors should not include identifying or confidential information in their stories.

## Run locally

Open `index.html` in a browser, or serve the project directory with any static web server. No build step or package installation is required.
"# help-with-kch" 
