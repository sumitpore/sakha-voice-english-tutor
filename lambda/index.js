const Alexa = require('ask-sdk-core');
const { S3PersistenceAdapter } = require('ask-sdk-s3-persistence-adapter');
const https = require('https');
const fs = require('fs');
const path = require('path');

/* ---------- settings ---------- */

const FAL_KEY = process.env.FAL_KEY || 'PASTE_YOUR_FAL_KEY_HERE';
const MODEL = 'google/gemini-3-flash-preview';

const SYSTEM_PROMPT = fs.readFileSync(path.join(__dirname, 'sakha-prompt.txt'), 'utf8');

if (!SYSTEM_PROMPT || SYSTEM_PROMPT.trim().length < 100) {
  console.log('WARNING: sakha-prompt.txt is missing or looks empty.');
}

const MEMORY_KEEPER = [
  'You keep memory for a voice English tutor. Read the session transcript.',
  'Reply with ONLY a JSON object and nothing else, in exactly this shape:',
  '{"name":"first name in lower case, or unknown",',
  '"band":"the age band that was used",',
  '"mistakes":["short items they got wrong"],',
  '"mastered":["short items they clearly got right"],',
  '"lastTopic":"a few words",',
  '"note":"one short sentence worth remembering next time"}',
  'Keep every list to six short items at most. No commentary.',
].join(' ');

const persistenceAdapter = new S3PersistenceAdapter({
  bucketName: process.env.S3_PERSISTENCE_BUCKET,
});

/* ---------- model call ---------- */

function callModel(systemText, promptText, maxTokens) {
  const payload = JSON.stringify({
    model: MODEL,
    system_prompt: systemText,
    prompt: promptText,
    max_tokens: maxTokens || 200,
    temperature: 0.6,
  });

  const options = {
    hostname: 'fal.run',
    path: '/openrouter/router/enterprise',
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Key ' + FAL_KEY,
      'content-length': Buffer.byteLength(payload),
    },
  };

  return new Promise(function (resolve, reject) {
    const req = https.request(options, function (res) {
      let body = '';
      res.on('data', function (chunk) {
        body += chunk;
      });
      res.on('end', function () {
        try {
          const data = JSON.parse(body);
          if (data.error) {
            reject(new Error(JSON.stringify(data.error)));
            return;
          }
          if (data.usage) {
            console.log('cost:', data.usage.cost);
          }
          const text = (data.output || '').trim();
          if (!text) {
            reject(new Error('Empty: ' + body.slice(0, 200)));
            return;
          }
          resolve(text);
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

/* ---------- helpers ---------- */

function transcriptOf(history) {
  return history
    .map(function (m) {
      return (m.role === 'user' ? 'Learner: ' : 'Sakha: ') + m.content;
    })
    .join('\n');
}

function clean(text) {
  return text.replace(/^\s*(Sakha|सखा)\s*:\s*/i, '').trim();
}

function rosterText(store) {
  const learners = (store && store.learners) || {};
  const names = Object.keys(learners);
  if (names.length === 0) {
    return 'No one has used this speaker before. This is session one.';
  }
  return names
    .map(function (n) {
      const p = learners[n];
      return [
        n + ':',
        'band ' + (p.band || 'unknown') + ',',
        'sessions ' + (p.sessions || 1) + ',',
        'last topic ' + (p.lastTopic || 'none') + ',',
        'still shaky on ' + ((p.mistakes || []).slice(0, 6).join('; ') || 'nothing') + '.',
        p.note || '',
      ].join(' ');
    })
    .join('\n');
}

function mergeUnique(oldList, newList, limit) {
  const seen = {};
  const out = [];
  (newList || []).concat(oldList || []).forEach(function (item) {
    const key = String(item).toLowerCase().trim();
    if (key && !seen[key]) {
      seen[key] = true;
      out.push(item);
    }
  });
  return out.slice(0, limit);
}

async function rememberSession(input) {
  const attrs = input.attributesManager.getSessionAttributes();
  const history = attrs.history || [];
  if (history.length < 4 || attrs.saved) {
    return;
  }
  attrs.saved = true;

  try {
    const raw = await callModel(MEMORY_KEEPER, transcriptOf(history), 400);
    const json = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
    const found = JSON.parse(json);
    const name = (found.name || 'unknown').toLowerCase().trim();

    const store = (await input.attributesManager.getPersistentAttributes()) || {};
    store.learners = store.learners || {};
    const prev = store.learners[name] || {};

    store.learners[name] = {
      band: found.band || prev.band,
      lastTopic: found.lastTopic || prev.lastTopic,
      note: found.note || prev.note,
      sessions: (prev.sessions || 0) + 1,
      mastered: mergeUnique(prev.mastered, found.mastered, 40),
      mistakes: mergeUnique(prev.mistakes, found.mistakes, 40),
    };

    input.attributesManager.setPersistentAttributes(store);
    await input.attributesManager.savePersistentAttributes();
    console.log('memory saved for', name);
  } catch (e) {
    console.log('memory save failed:', e.message);
  }
}

/* ---------- keep the mic open ---------- */

function keepListening(builder, speech) {
  return builder
    .speak(speech)
    .reprompt(speech)
    .withShouldEndSession(false)
    .getResponse();
}

async function respondTo(input, learnerText) {
  const attrs = input.attributesManager.getSessionAttributes();
  attrs.history = attrs.history || [];
  if (learnerText) {
    attrs.history.push({ role: 'user', content: learnerText });
  }
  if (attrs.history.length > 24) {
    attrs.history = [attrs.history[0]].concat(attrs.history.slice(-23));
  }
  const reply = clean(await callModel(SYSTEM_PROMPT, transcriptOf(attrs.history) + '\nSakha:'));
  attrs.history.push({ role: 'assistant', content: reply });
  input.attributesManager.setSessionAttributes(attrs);
  return keepListening(input.responseBuilder, reply);
}

/* ---------- handlers ---------- */

const LaunchHandler = {
  canHandle(input) {
    return Alexa.getRequestType(input.requestEnvelope) === 'LaunchRequest';
  },
  async handle(input) {
    let store = {};
    try {
      store = (await input.attributesManager.getPersistentAttributes()) || {};
    } catch (e) {
      console.log('memory load failed:', e.message);
    }

    const opening = ['<learner_memory>', rosterText(store), '</learner_memory>', 'नया session शुरू कीजिए.'].join('\n');

    input.attributesManager.setSessionAttributes({
      history: [{ role: 'user', content: opening }],
    });
    return respondTo(input, null);
  },
};

const StopHandler = {
  canHandle(input) {
    const name =
      Alexa.getRequestType(input.requestEnvelope) === 'IntentRequest' ? Alexa.getIntentName(input.requestEnvelope) : '';
    return name === 'AMAZON.StopIntent' || name === 'AMAZON.CancelIntent';
  },
  async handle(input) {
    await rememberSession(input);
    return input.responseBuilder.speak('फिर मिलते हैं. Bye bye.').getResponse();
  },
};

const AnyIntentHandler = {
  canHandle(input) {
    return Alexa.getRequestType(input.requestEnvelope) === 'IntentRequest';
  },
  async handle(input) {
    const intent = Alexa.getIntentName(input.requestEnvelope);
    console.log('INTENT:', intent);

    let said = Alexa.getSlotValue(input.requestEnvelope, 'query') || '';

    if (!said) {
      console.log('no slot value on', intent);
      if (intent === 'AMAZON.HelpIntent') {
        said = 'मुझे मदद चाहिए, समझ नहीं आ रहा.';
      } else {
        said =
          "[The speech recogniser did not capture the learner's words. React naturally: say you did not catch that, and ask them to say it again.]";
      }
    }

    return respondTo(input, said);
  },
};

const SessionEndedHandler = {
  canHandle(input) {
    return Alexa.getRequestType(input.requestEnvelope) === 'SessionEndedRequest';
  },
  async handle(input) {
    console.log('SESSION ENDED, full request:', JSON.stringify(input.requestEnvelope.request));
    await rememberSession(input);
    return input.responseBuilder.getResponse();
  },
};

const ErrorHandler = {
  canHandle() {
    return true;
  },
  handle(input, error) {
    const type = Alexa.getRequestType(input.requestEnvelope);
    console.log('Sakha error on', type, ':', error.message);
    console.log(error.stack);
    if (type === 'SessionEndedRequest') {
      return input.responseBuilder.getResponse();
    }
    return keepListening(input.responseBuilder, 'माफ कीजिए, कुछ गड़बड़ हो गई. फिर से बोलिए.');
  },
};

exports.handler = Alexa.SkillBuilders.custom()
  .addRequestHandlers(LaunchHandler, StopHandler, AnyIntentHandler, SessionEndedHandler)
  .addErrorHandlers(ErrorHandler)
  .withPersistenceAdapter(persistenceAdapter)
  .lambda();