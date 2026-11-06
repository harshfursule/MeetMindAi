/**
 * MeetMind AI - Meeting Summarization Service
 * Supports Google Gemini, OpenAI, and a built-in intelligent rule-based NLP extractor
 * for 100% offline & local reliability.
 */

/**
 * Common English stop words for topic extraction
 */
const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'aren\'t', 'as', 'at',
  'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by', 'can', 'can\'t', 'cannot',
  'could', 'couldn\'t', 'did', 'didn\'t', 'do', 'does', 'doesn\'t', 'doing', 'don\'t', 'down', 'during', 'each',
  'few', 'for', 'from', 'further', 'had', 'hadn\'t', 'has', 'hasn\'t', 'have', 'haven\'t', 'having', 'he', 'he\'d',
  'he\'ll', 'he\'s', 'her', 'here', 'here\'s', 'hers', 'herself', 'him', 'himself', 'his', 'how', 'how\'s', 'i',
  'i\'d', 'i\'ll', 'i\'m', 'i\'ve', 'if', 'in', 'into', 'is', 'isn\'t', 'it', 'it\'s', 'its', 'itself', 'let\'s',
  'me', 'more', 'most', 'mustn\'t', 'my', 'myself', 'no', 'nor', 'not', 'of', 'off', 'on', 'once', 'only', 'or',
  'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own', 'same', 'shan\'t', 'she', 'she\'d', 'she\'ll',
  'she\'s', 'should', 'shouldn\'t', 'so', 'some', 'such', 'than', 'that', 'that\'s', 'the', 'their', 'theirs',
  'them', 'themselves', 'then', 'there', 'there\'s', 'these', 'they', 'they\'d', 'they\'ll', 'they\'re', 'they\'ve',
  'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was', 'wasn\'t', 'we', 'we\'d', 'we\'ll',
  'we\'re', 'we\'ve', 'were', 'weren\'t', 'what', 'what\'s', 'when', 'when\'s', 'where', 'where\'s', 'which', 'while',
  'who', 'who\'s', 'whom', 'why', 'why\'s', 'with', 'won\'t', 'would', 'wouldn\'t', 'you', 'you\'d', 'you\'ll',
  'you\'re', 'you\'ve', 'your', 'yours', 'yourself', 'yourselves', 'hello', 'hey', 'yeah', 'yes', 'okay', 'ok',
  'thanks', 'thank', 'um', 'uh', 'like', 'just', 'well'
]);

/**
 * Intelligent rule-based NLP extraction pipeline
 * Used when no external LLM API key is provided, or as an automatic fallback.
 *
 * @param {Array<{ speakerName: string, text: string, timestamp?: Date }>} entries
 * @param {string} meetingTitle
 * @returns {Object} Structured summary object
 */
function summarizeWithNLP(entries, meetingTitle = 'Meeting') {
  if (!entries || entries.length === 0) {
    return {
      overview: `No spoken dialogue was recorded for "${meetingTitle}".`,
      keyPoints: ['No transcript entries recorded during the session.'],
      actionItems: [],
      topics: ['General Discussion'],
      sentiment: 'neutral',
      generatedBy: 'meetmind-nlp-engine',
    };
  }

  // 1. Collect all speakers and dialogue lines
  const speakers = [...new Set(entries.map((e) => e.speakerName?.trim() || 'Participant'))];
  const fullText = entries.map((e) => `${e.speakerName}: ${e.text}`).join('\n');
  const sentences = [];

  entries.forEach((e) => {
    // Split on sentence boundaries
    const splits = e.text.split(/(?<=[.?!])\s+/);
    splits.forEach((s) => {
      const clean = s.trim();
      if (clean.length > 5) {
        sentences.push({
          speaker: e.speakerName,
          text: clean,
          timestamp: e.timestamp,
        });
      }
    });
  });

  // 2. Action Items Heuristics
  const actionItems = [];
  const actionTriggers = [
    /\b(will|shall)\s+([a-z\s]+)/i,
    /\b(todo|action item|task)\b/i,
    /\b(need to|have to|must|should)\s+([a-z\s]+)/i,
    /\b(follow up|follow-up|check with|reach out to)\b/i,
    /\b(assign|assigned to|responsible for)\b/i,
    /\b(i'll|we'll|let's|i will|we will)\s+([a-z\s]+)/i,
    /\b(prepare|create|send|update|fix|deploy|schedule|review|draft|test|implement)\b/i,
  ];

  sentences.forEach((sentence) => {
    const isAction = actionTriggers.some((rgx) => rgx.test(sentence.text));
    if (isAction && actionItems.length < 8) {
      // Determine assignee
      let assignee = 'Unassigned';

      // Check if speaker says "I will", "I'll", "I can"
      if (/^\b(i will|i'll|i can|i'm going to)\b/i.test(sentence.text)) {
        assignee = sentence.speaker;
      } else {
        // Check if any known speaker name is mentioned
        const mentionedSpeaker = speakers.find(
          (spk) => spk.toLowerCase() !== sentence.speaker.toLowerCase() &&
                   new RegExp(`\\b${spk}\\b`, 'i').test(sentence.text)
        );
        if (mentionedSpeaker) {
          assignee = mentionedSpeaker;
        } else {
          assignee = sentence.speaker;
        }
      }

      // Clean task text
      let task = sentence.text.replace(/^(okay|so|well|and|also|um|uh),?\s*/i, '');
      if (task.length > 10 && !actionItems.some((ai) => ai.task.toLowerCase() === task.toLowerCase())) {
        actionItems.push({
          task,
          assignee,
          dueDate: null,
          status: 'pending',
        });
      }
    }
  });

  // 3. Key Discussion Points Heuristics
  const keyPoints = [];
  const decisionTriggers = [
    /\b(agree|agreed|decision|decided|conclude|concluded)\b/i,
    /\b(important|crucial|priority|critical|key|notable)\b/i,
    /\b(plan is|strategy|roadmap|milestone|goal|objective)\b/i,
    /\b(we should|we can|we decided|the recommendation)\b/i,
    /\b(problem|issue|bug|blocker|risk|solution)\b/i,
    /\b(deadline|timeline|launch|release)\b/i,
  ];

  sentences.forEach((sentence) => {
    const isKeyPoint = decisionTriggers.some((rgx) => rgx.test(sentence.text));
    if (isKeyPoint && keyPoints.length < 6) {
      const clean = `${sentence.speaker}: "${sentence.text.replace(/^(okay|so|well|and),?\s*/i, '')}"`;
      if (!keyPoints.includes(clean)) {
        keyPoints.push(clean);
      }
    }
  });

  // Fallback if no specific key points matched
  if (keyPoints.length === 0) {
    const sampled = sentences.slice(0, Math.min(3, sentences.length));
    sampled.forEach((s) => keyPoints.push(`${s.speaker}: "${s.text}"`));
  }

  // 4. Salient Topics Extraction (TF analysis)
  const wordFreq = {};
  const words = fullText.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/);
  words.forEach((w) => {
    if (w.length > 3 && !STOP_WORDS.has(w) && !speakers.some((s) => s.toLowerCase() === w)) {
      wordFreq[w] = (wordFreq[w] || 0) + 1;
    }
  });

  const topTopics = Object.entries(wordFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word.charAt(0).toUpperCase() + word.slice(1));

  if (topTopics.length === 0) {
    topTopics.push('Meeting Collaboration', 'Discussion');
  }

  // 5. Sentiment Heuristic
  const positiveWords = ['great', 'good', 'awesome', 'excellent', 'agree', 'perfect', 'resolved', 'success', 'happy', 'love'];
  const negativeWords = ['problem', 'issue', 'bad', 'blocker', 'failed', 'delay', 'difficult', 'wrong', 'error', 'bug'];
  let posCount = 0;
  let negCount = 0;

  words.forEach((w) => {
    if (positiveWords.includes(w)) posCount++;
    if (negativeWords.includes(w)) negCount++;
  });

  let sentiment = 'constructive';
  if (posCount > negCount + 1) sentiment = 'positive';
  else if (negCount > posCount + 1) sentiment = 'negative';

  // 6. Executive Overview Generation
  const totalStatements = entries.length;
  const speakerSummary = speakers.join(', ');
  const topicSummary = topTopics.slice(0, 3).join(', ');

  const overview = `In this meeting regarding "${meetingTitle}", ${speakers.length} participant(s) (${speakerSummary}) held an active discussion covering ${topicSummary}. A total of ${totalStatements} statements were recorded. The team established key alignment on project directions, prioritized actionable follow-ups, and aligned on upcoming objectives.`;

  return {
    overview,
    keyPoints,
    actionItems,
    topics: topTopics,
    sentiment,
    generatedBy: 'meetmind-nlp-engine',
  };
}

/**
 * Call Google Gemini LLM API (gemini-1.5-flash / gemini-pro)
 *
 * @param {string} prompt
 * @param {string} apiKey
 * @returns {Promise<Object>}
 */
async function callGemini(prompt, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textResponse) {
    throw new Error('Gemini API returned an empty response.');
  }

  return JSON.parse(textResponse);
}

/**
 * Call OpenAI API (gpt-4o-mini / gpt-3.5-turbo)
 *
 * @param {string} prompt
 * @param {string} apiKey
 * @returns {Promise<Object>}
 */
async function callOpenAI(prompt, apiKey) {
  const url = 'https://api.openai.com/v1/chat/completions';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are MeetMind AI, an expert meeting analyst. You output ONLY valid JSON matching the requested schema.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI API returned an empty response.');
  }

  return JSON.parse(content);
}

/**
 * Generate meeting summary from transcript entries.
 * Checks for external LLM API keys first; seamlessly falls back to NLP engine on failure or absence.
 *
 * @param {Array<{ speakerName: string, text: string, timestamp?: Date }>} transcriptEntries
 * @param {string} meetingTitle
 * @returns {Promise<{ overview: string, keyPoints: string[], actionItems: Array, topics: string[], sentiment: string, generatedBy: string }>}
 */
async function generateMeetingSummary(transcriptEntries, meetingTitle = 'Meeting') {
  if (!transcriptEntries || transcriptEntries.length === 0) {
    return summarizeWithNLP([], meetingTitle);
  }

  const formattedTranscript = transcriptEntries
    .map((e) => {
      const timeStr = e.timestamp
        ? new Date(e.timestamp).toLocaleTimeString('en-US', { hour12: false })
        : '';
      return `[${timeStr}] ${e.speakerName}: ${e.text}`;
    })
    .join('\n');

  const prompt = `Analyze this video meeting transcript for "${meetingTitle}" and generate a structured JSON summary.

Transcript:
${formattedTranscript}

You MUST return a JSON object with this exact structure:
{
  "overview": "A concise executive summary paragraph (3-5 sentences) summarizing the main purpose, discussion, and outcomes of the meeting.",
  "keyPoints": [
    "Key discussion point or decision 1",
    "Key discussion point or decision 2",
    "Key discussion point or decision 3"
  ],
  "actionItems": [
    {
      "task": "Specific task description",
      "assignee": "Name of the person responsible (or 'Unassigned' if not mentioned)",
      "dueDate": "Due date if mentioned, otherwise null",
      "status": "pending"
    }
  ],
  "topics": ["Topic1", "Topic2", "Topic3"],
  "sentiment": "positive" | "neutral" | "constructive" | "negative"
}`;

  // Try Google Gemini
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (geminiKey) {
    try {
      console.log('[AI Summarizer] Calling Google Gemini API...');
      const geminiResult = await callGemini(prompt, geminiKey);
      return {
        overview: geminiResult.overview || 'Meeting completed.',
        keyPoints: Array.isArray(geminiResult.keyPoints) ? geminiResult.keyPoints : [],
        actionItems: Array.isArray(geminiResult.actionItems) ? geminiResult.actionItems : [],
        topics: Array.isArray(geminiResult.topics) ? geminiResult.topics : [],
        sentiment: geminiResult.sentiment || 'constructive',
        generatedBy: 'Google Gemini (gemini-1.5-flash)',
      };
    } catch (err) {
      console.warn('[AI Summarizer] Gemini API call failed, trying next provider or fallback:', err.message);
    }
  }

  // Try OpenAI
  const openAIKey = process.env.OPENAI_API_KEY;
  if (openAIKey) {
    try {
      console.log('[AI Summarizer] Calling OpenAI API...');
      const openAIResult = await callOpenAI(prompt, openAIKey);
      return {
        overview: openAIResult.overview || 'Meeting completed.',
        keyPoints: Array.isArray(openAIResult.keyPoints) ? openAIResult.keyPoints : [],
        actionItems: Array.isArray(openAIResult.actionItems) ? openAIResult.actionItems : [],
        topics: Array.isArray(openAIResult.topics) ? openAIResult.topics : [],
        sentiment: openAIResult.sentiment || 'constructive',
        generatedBy: 'OpenAI (' + (process.env.OPENAI_MODEL || 'gpt-4o-mini') + ')',
      };
    } catch (err) {
      console.warn('[AI Summarizer] OpenAI API call failed, falling back to NLP engine:', err.message);
    }
  }

  // Built-in intelligent NLP heuristic engine (100% reliable local/offline)
  console.log('[AI Summarizer] Utilizing built-in MeetMind NLP engine for summarization.');
  return summarizeWithNLP(transcriptEntries, meetingTitle);
}

module.exports = {
  generateMeetingSummary,
  summarizeWithNLP,
};
