# Sakha (सखा)

Sakha is an Alexa skill that turns an Amazon Echo into a voice-only English tutor for Hindi-speaking homes. It teaches in a “learn first, practise next” style: one small point, then immediate spoken practice, with Hinglish explanations and clean-English target sentences.

The name means “a dear companion” — the friend who sits beside you, not above you. It supports the whole family (roughly ages 5 to 60+), with different teaching styles per age band.

## How it works

```
Echo / Alexa app
      │  speech (Hindi locale)
      ▼
Alexa (speech → text)
      │
      ▼
AWS Lambda (this repo’s lambda/index.js)
      │  system prompt + conversation history
      ▼
fal.ai OpenRouter enterprise endpoint
      │  LLM reply (default: Gemini Flash)
      ▼
Alexa TTS → spoken aloud on the device
```

- **Interaction model** (`interaction-model.json`) — tells Alexa which words open the skill and how free speech is captured. Almost every utterance is routed into a catch-all `ChatIntent` so the learner can speak naturally.
- **Lambda code** (`lambda/index.js`) — receives each turn, calls the LLM, keeps the microphone open, and updates learner memory.
- **System prompt** (`lambda/sakha-prompt.txt`) — personality, pedagogy, age bands, Hinglish rules, and child-safety policy.
- **fal.ai** — hosts the LLM call. You only need an API key; the endpoint and model are already set in `index.js`.

## Memory

Sakha remembers learners across sessions, so the next time someone opens the skill it can greet them by name and warm up from things they struggled with last time.

- **During a session** — Sakha keeps the current conversation in mind so each reply follows what was just said.
- **When the session ends** (for example after “Alexa, stop”) — it saves a short note about that learner: name, age band, recent mistakes, what they got right, and how many sessions they have done.
- **Where it is stored** — in Amazon S3 storage that comes with your Alexa-hosted skill (Amazon sets this up for you; you do not create a bucket yourself). Memory stays with your skill / Amazon account — it is not stored on fal.ai or on the Echo device.
- **Who it is for** — notes are keyed by first name, so different people in the house can each have their own progress if they use different names.

Sakha never reads these notes aloud or tells the learner that it “keeps a file” on them; it just uses them quietly to teach better next time.

## Setup

You will use the [Alexa developer console](https://developer.amazon.com). An Amazon developer account is required (same account you use on the Echo if you want device testing).

### 1. Create the skill

Create Skill, then choose:

| Choice | Select | Why |
|---|---|---|
| Skill name | **Sakha** | Display name in the console (can differ from the spoken invocation name). |
| Primary locale | **Hindi (IN)** | Alexa must understand Hindi speech and speak Hindi TTS. Marathi and other Indian languages are not supported as Alexa skill locales. |
| Experience / model | **Custom** | Custom skills let you define your own intents and run your own code. Pre-built models (Smart Home, Flash Briefing, etc.) are for other product types — not a conversational tutor. On newer wizards, experience type may appear as **Other**. |
| Hosting | **Alexa-hosted (Node.js)** | Amazon provisions Lambda, S3, and a Code editor for you. No separate AWS account setup. This repo’s `lambda/` files are meant to be pasted into that hosted Code tab. |
| Hosting region | **EU (Ireland)** | Alexa-hosted region for this skill. Match what you pick here when following the rest of the guide. |
| Template | **Start from Scratch** | Empty custom skill; you will replace the model and code with this repo’s files. |

### 2. Interaction model

The interaction model is the skill’s “voice grammar”: invocation name, intents, and sample phrases.

1. Build tab → Interaction Model → **JSON Editor**
2. Paste the contents of `interaction-model.json`
3. **Save**, then **Build skill** and wait for success

Notes:

- Invocation name in this repo is `सखा`. Users open it with phrases like “सखा skill खोलो” (see Test below).
- If the console rejects Devanagari, set the invocation name to Latin `sakha` and use “Alexa, open sakha”.
- The model uses a catch-all slot (`AnythingSlot`) so free-form speech reaches your code. Do not add `AMAZON.FallbackIntent` — it can steal utterances away from the LLM.

### 3. Code

Alexa-hosted skills edit code in the **Code** tab (Node.js on Lambda). After each change you must Save, Deploy, then rebuild.

1. Get a fal API key from fal.ai only (nothing else happens on fal.ai): [fal.ai/dashboard/keys](https://fal.ai/dashboard/keys) → **Create Key** (API scope is enough) → copy it immediately (shown once)
2. Back in the **Alexa developer console**, open your skill → **Code** tab. The left file tree already has a `lambda/` folder (Amazon creates this for Alexa-hosted skills). Copy files from this repo into that folder:
   - Open `lambda/index.js` in the tree → select all → paste this repo’s `lambda/index.js`
   - Open `lambda/package.json` → replace with this repo’s `lambda/package.json`
   - Create a new file **inside** `lambda/` (same level as `index.js`), name it `sakha-prompt.txt`, and paste this repo’s `lambda/sakha-prompt.txt` into it. If this file is missing or outside `lambda/`, the tutor persona will not load.
3. Still in the Alexa Code tab, in `index.js`, replace `PASTE_YOUR_FAL_KEY_HERE` with the fal key you copied
4. **Save**, then click **Deploy** (first deploy after changing `package.json` is slower while dependencies install)
5. Go back to the **Build** tab → click **Build Skill** and wait until it finishes successfully
6. Only then open the **Test** tab

Do this Save → Deploy → Build Skill sequence after every code change in the Alexa console.

Alexa-hosted has no UI for custom environment variables, so the fal key must live in the `FAL_KEY` constant for the hosted skill. Do not commit your key to git.

### 4. Test

After Build Skill succeeds, you do **not** need to publish. Switching the Test tab to **Development** makes the skill available on every Alexa/Echo device signed into the **same Amazon account** as the developer console.

**How to invoke**
- Direct: **"Alexa, सखा skill खोलो"** or **"Alexa, सखा skill शुरु करो"**
- Two-step: say **"Alexa, Skill खोलो"** → when Alexa asks which skill, say or type **सखा**
- If the invocation name was saved as Latin `sakha`, use **"Alexa, open sakha"** instead
- In the simulator, type Devanagari (`सखा`) — Roman `sakha kholo` often fails for typed tests

**In the console (simulator)**
1. Open the **Test** tab
2. Change Skill testing from **Off** → **Development**
3. Invoke with one of the phrases above, then talk through a short lesson to confirm replies

**On a real Echo / Alexa device**
1. Use a device logged into the **same Amazon account** as the developer console
2. In the Alexa app: Devices → your Echo → gear → Language → set **हिन्दी** or **हिन्दी/English**
3. Invoke with one of the phrases above

The skill should greet you and keep listening for spoken replies — same as a published skill, but only for your account while Development testing is on.

**Exit the skill**
- Say **"Alexa, stop"** or **"Alexa, cancel"** (or just **stop** / **cancel** while the mic is open)
- Sakha replies `फिर मिलते हैं. Bye bye.`, saves session memory, and ends
- Saying **बंद करो** asks Sakha to wrap up in conversation, but **"Alexa, stop"** is the reliable way to leave

## Repo layout

| Path | Role |
|---|---|
| `lambda/sakha-prompt.txt` | Tutor personality, lesson flow, age bands, safety |
| `lambda/index.js` | Alexa request handlers, fal.ai calls, session + S3 memory |
| `lambda/package.json` | Node dependencies for the Alexa-hosted Lambda |
| `interaction-model.json` | Hindi (IN) invocation name + catch-all chat intent |

## License

MIT — see `LICENSE`.
