# Sakha (सखा)

Alexa skill that turns an Echo into a voice-only English tutor for Hindi-speaking homes. Hinglish explanations, clean-English practice, ages 5 to 60+.

## Setup

### 1. Create the skill
- [Alexa developer console](https://developer.amazon.com) → Create Skill → name **Sakha** → locale **Hindi (IN)** → **Custom** → **Alexa-hosted (Node.js)** → region **EU (Ireland)** → Start from Scratch

### 2. Interaction model
- Build → Interaction Model → **JSON Editor** → paste `interaction-model.json` → **Save** → **Build skill**
- If Devanagari invocation is rejected, use `sakha` and say "Alexa, open sakha"

### 3. Code
- Code tab → replace with `lambda/index.js`, `lambda/package.json`, and `lambda/sakha-prompt.txt`
- In `index.js`, replace `PASTE_YOUR_FAL_KEY_HERE` with your fal API key (see next step)
- **Deploy**

### 4. fal.ai key
1. Sign in at [fal.ai/dashboard/keys](https://fal.ai/dashboard/keys)
2. **Create Key** (API scope is enough) → copy it immediately (shown once)
3. Paste into the `FAL_KEY` fallback in `index.js` before deploying

Alexa-hosted has no custom env-var UI, so the key must live in that constant for the hosted skill. Do not commit it.

### 5. Test

You do **not** need to publish the skill. Switching the Test tab to Development makes it available on every Alexa/Echo device signed into the same Amazon account as the developer console.

**In the console (simulator)**
1. Open the **Test** tab
2. Change Skill testing from **Off** → **Development**
3. Type `सखा skill खोलो` (use Devanagari — Roman `sakha kholo` often fails in typed tests)
4. Talk through a short lesson in the chat box to confirm the LLM replies

**On a real Echo / Alexa device**
1. Use a device logged into the **same Amazon account** as the developer console
2. In the Alexa app: Devices → your Echo → gear → Language → set **हिन्दी** or **हिन्दी/English**
3. Say: **"Alexa, सखा skill खोलो"**
4. If the invocation name was saved as Latin `sakha`, say **"Alexa, open sakha"** instead

The skill should greet you and keep listening for spoken replies — same as a published skill, but only for your account while Development testing is on.

## Repo layout

| Path | Role |
|---|---|
| `lambda/sakha-prompt.txt` | Personality, pedagogy, safety |
| `lambda/index.js` | Alexa handler + fal.ai calls + memory |
| `interaction-model.json` | hi-IN catch-all voice model |

## License

MIT — see `LICENSE`.
