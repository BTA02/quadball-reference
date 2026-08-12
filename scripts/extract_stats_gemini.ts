import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { GoogleGenAI } from '@google/genai';

// Load environment variables from .env.local first
const envLocalPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
} else {
  dotenv.config();
}

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error('\x1b[31mError: GEMINI_API_KEY is not defined in your environment or .env.local file.\x1b[0m');
  console.error('Please obtain an API key from Google AI Studio (https://aistudio.google.com/) and add it to .env.local:');
  console.error('GEMINI_API_KEY="your_api_key_here"');
  process.exit(1);
}

// Initialize the Gemini client using the official @google/genai SDK
const ai = new GoogleGenAI({ apiKey: API_KEY });

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  let videoPath = '';
  let youtubeUrl = '';
  let modelName = 'gemini-2.5-flash'; // default cost-effective multimodal model

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--video' || args[i] === '-v') {
      videoPath = args[i + 1];
      i++;
    } else if (args[i] === '--url' || args[i] === '-u') {
      youtubeUrl = args[i + 1];
      i++;
    } else if (args[i] === '--model' || args[i] === '-m') {
      modelName = args[i + 1];
      i++;
    }
  }

  return { videoPath, youtubeUrl, modelName };
}

// Download video using local yt-dlp binary
async function downloadYoutubeVideo(url: string): Promise<string> {
  const ytDlpPath = path.resolve(process.cwd(), 'yt-dlp');
  const outputFileName = 'downloaded_game_video.mp4';
  const outputPath = path.resolve(process.cwd(), outputFileName);

  console.log(`\n\x1b[36m[yt-dlp] Downloading YouTube video to: ${outputPath}...\x1b[0m`);
  console.log(`\x1b[33mUsing optimized lower resolution (worst/mp4/480p) to minimize upload times and token consumption...\x1b[0m`);

  // Ensure yt-dlp has executable permissions (macOS safety check)
  if (process.platform === 'darwin' || process.platform === 'linux') {
    try {
      fs.chmodSync(ytDlpPath, '755');
    } catch (e) {
      console.warn(`[Warning] Could not set executable permissions on yt-dlp binary: ${(e as Error).message}`);
    }
  }

  return new Promise((resolve, reject) => {
    // -f "mp4[height<=480]/worst[ext=mp4]/worst" gives a highly compressed video that still lets the AI read jerseys
    const child = spawn(ytDlpPath, [
      '-f', 'mp4[height<=360]/mp4[height<=480]/worst[ext=mp4]/worst',
      '-o', outputPath,
      '--no-playlist',
      url
    ]);

    child.stdout.on('data', (data) => {
      process.stdout.write(data.toString());
    });

    child.stderr.on('data', (data) => {
      process.stderr.write(data.toString());
    });

    child.on('close', (code) => {
      if (code === 0 && fs.existsSync(outputPath)) {
        console.log(`\n\x1b[32m[yt-dlp] Download completed successfully: ${outputPath}\x1b[0m`);
        resolve(outputPath);
      } else {
        reject(new Error(`yt-dlp process exited with code ${code}`));
      }
    });
  });
}

// Robust JSON healer to handle occasionally truncated AI responses
function healTruncatedJson(jsonStr: string): string {
  let cleaned = jsonStr.trim();
  
  // If it's already valid, return it
  try {
    JSON.parse(cleaned);
    return cleaned;
  } catch (e) {
    // Continue to healing
  }

  console.log(`\n\x1b[33m[JSON Healer] Output JSON is truncated or incomplete. Attempting to heal...\x1b[0m`);

  // Step 1: Remove trailing comma if present
  if (cleaned.endsWith(',')) {
    cleaned = cleaned.slice(0, -1).trim();
  }

  // Step 2: Remove a trailing open '{' if it was cut off exactly at the start of a new item
  if (cleaned.endsWith('{')) {
    cleaned = cleaned.slice(0, -1).trim();
  }
  if (cleaned.endsWith(',')) {
    cleaned = cleaned.slice(0, -1).trim();
  }

  // Step 3: Walk the string to track open brackets/braces
  const stack: ('{' | '[')[] = [];
  let inString = false;
  let escape = false;

  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    
    if (escape) {
      escape = false;
      continue;
    }
    
    if (char === '\\') {
      escape = true;
      continue;
    }
    
    if (char === '"') {
      inString = !inString;
      continue;
    }
    
    if (!inString) {
      if (char === '{' || char === '[') {
        stack.push(char);
      } else if (char === '}') {
        if (stack[stack.length - 1] === '{') {
          stack.pop();
        }
      } else if (char === ']') {
        if (stack[stack.length - 1] === '[') {
          stack.pop();
        }
      }
    }
  }

  // If we were inside an unclosed string, close it
  if (inString) {
    cleaned += '"';
  }

  // Backtrack to the last complete item if we got cut off inside an object or array item
  // In our events list, items are separated by '},' or '}'
  const lastCompleteEventEnd = cleaned.lastIndexOf('},');
  if (lastCompleteEventEnd !== -1) {
    cleaned = cleaned.slice(0, lastCompleteEventEnd + 1).trim();
    cleaned += '\n  ]\n}';
    
    try {
      JSON.parse(cleaned);
      console.log(`\x1b[32m[JSON Healer] Healed JSON by backtracking to last complete event item!\x1b[0m`);
      return cleaned;
    } catch (e) {
      // Slicing fallback did not work, use generic close
    }
  }

  // Generic fallback: close open brackets in reverse order
  let healerSuffix = '';
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i] === '{') {
      healerSuffix += '}';
    } else if (stack[i] === '[') {
      healerSuffix += ']';
    }
  }
  
  const finalAttempt = cleaned + healerSuffix;
  try {
    JSON.parse(finalAttempt);
    console.log(`\x1b[32m[JSON Healer] Healed JSON by appending closing brackets: ${healerSuffix.replace(/\n/g, ' ')}\x1b[0m`);
    return finalAttempt;
  } catch (e) {
    console.error(`\x1b[31m[JSON Healer] Healing failed to produce valid JSON: ${(e as Error).message}\x1b[0m`);
    return jsonStr; // return original if we couldn't heal it
  }
}

// Main execution function
async function run() {
  const { videoPath: argVideoPath, youtubeUrl, modelName } = parseArgs();

  let finalVideoPath = '';

  if (youtubeUrl) {
    try {
      finalVideoPath = await downloadYoutubeVideo(youtubeUrl);
    } catch (err) {
      console.error(`\x1b[31mError downloading YouTube video:\x1b[0m`, err);
      process.exit(1);
    }
  } else if (argVideoPath) {
    finalVideoPath = path.resolve(process.cwd(), argVideoPath);
    if (!fs.existsSync(finalVideoPath)) {
      console.error(`\x1b[31mError: Specified video file does not exist at ${finalVideoPath}\x1b[0m`);
      process.exit(1);
    }
  } else {
    // If nothing specified, check for default temp file
    const defaultPath = path.resolve(process.cwd(), 'temp_ai_video.f160.mp4');
    if (fs.existsSync(defaultPath)) {
      console.log(`\x1b[33mNo arguments provided. Found default video in workspace root: temp_ai_video.f160.mp4\x1b[0m`);
      finalVideoPath = defaultPath;
    } else {
      console.error('\x1b[31mError: You must specify a video file or a YouTube URL.\x1b[0m');
      console.log('\nUsage examples:');
      console.log('  npm run extract-stats -- --video path/to/game.mp4');
      console.log('  npm run extract-stats -- --url "https://www.youtube.com/watch?v=..."');
      console.log('  npm run extract-stats -- --video temp_ai_video.f160.mp4 --model gemini-2.5-flash');
      process.exit(1);
    }
  }

  const fileStats = fs.statSync(finalVideoPath);
  const fileSizeMb = (fileStats.size / (1024 * 1024)).toFixed(2);
  console.log(`\n\x1b[36m[File Info] Preparing file for Gemini API:\x1b[0m`);
  console.log(`  Path: ${finalVideoPath}`);
  console.log(`  Size: ${fileSizeMb} MB`);

  let uploadFile;
  try {
    console.log(`\n\x1b[36m[Gemini Upload] Uploading video to Gemini Files API...\x1b[0m`);
    // Upload file using Files API (recommended for videos larger than 20MB)
    uploadFile = await ai.files.upload({
      file: finalVideoPath,
      config: { mimeType: 'video/mp4' }
    });

    console.log(`\x1b[32m[Gemini Upload] Upload successful! Resource ID: ${uploadFile.name}\x1b[0m`);
    console.log(`Waiting for Google servers to process the video (this can take a few minutes)...`);

    // Poll until video state is ACTIVE
    let fileInfo = await ai.files.get({ name: uploadFile.name });
    let dots = 0;
    while (fileInfo.state === 'PROCESSING') {
      dots = (dots + 1) % 4;
      const progressDots = '.'.repeat(dots) + ' '.repeat(3 - dots);
      process.stdout.write(`\rProcessing video status: ${fileInfo.state}${progressDots}`);
      await new Promise(resolve => setTimeout(resolve, 8000));
      fileInfo = await ai.files.get({ name: uploadFile.name });
    }
    
    // Clear line
    process.stdout.write('\r\x1b[K');

    if (fileInfo.state !== 'ACTIVE') {
      throw new Error(`Video processing failed with state: ${fileInfo.state}`);
    }
    console.log(`\x1b[32m[Gemini Upload] Video is ACTIVE and fully processed by AI servers!\x1b[0m`);

    // Define the strict structured JSON schema for play-by-play stats
    const responseSchema = {
      type: 'OBJECT',
      properties: {
        gameTitle: { type: 'STRING', description: 'Descriptive title of the match (e.g. Team A vs Team B)' },
        homeTeamName: { type: 'STRING', description: 'Name of the home team' },
        awayTeamName: { type: 'STRING', description: 'Name of the away team' },
        events: {
          type: 'ARRAY',
          description: 'Chronological list of all events, stats, goals, substitutions, and possession shifts in the video.',
          items: {
            type: 'OBJECT',
            properties: {
              videoTime: { type: 'INTEGER', description: 'Timestamp of the event in seconds from the exact start of the video' },
              type: {
                type: 'STRING',
                enum: [
                  'gameStart',
                  'gamePause',
                  'goal',
                  'assist',
                  'shot',
                  'turnover',
                  'control_change',
                  'sub_in',
                  'sub_out',
                  'flag_released',
                  'flag_catch',
                  'foul',
                  'card',
                  'gameEnd'
                ],
                description: 'The type of event being logged'
              },
              team: { type: 'STRING', enum: ['home', 'away', 'neutral'], description: 'The team initiating the action' },
              playerJersey: { type: 'STRING', description: 'Jersey number or ID of the primary player (e.g. goal-scorer, shooter, subbing out player)' },
              assistedByPlayerJersey: { type: 'STRING', description: 'Jersey number of the player making the assist (only for assist or goal-with-assist events)' },
              subPlayerJersey: { type: 'STRING', description: 'Jersey number of the player entering the pitch (only for sub_in events)' },
              position: { type: 'STRING', enum: ['chaser', 'keeper', 'beater', 'seeker'], description: 'Position of the active player(s)' },
              cardColor: { type: 'STRING', enum: ['blue', 'yellow', 'red'], description: 'Color of card issued if event type is card' },
              description: { type: 'STRING', description: 'Detailed one-sentence summary of the action, noting player numbers and team names.' }
            },
            required: ['videoTime', 'type', 'team', 'description']
          }
        }
      },
      required: ['gameTitle', 'homeTeamName', 'awayTeamName', 'events']
    };

    console.log(`\n\x1b[36m[Gemini Inference] Analyzing video content using model: ${modelName}...\x1b[0m`);

    const systemPrompt = `You are a professional sports analytics engine specializing in Quadball (formerly Quidditch) stats and film breakdown. 
Your goal is to watch this video segment and record a high-fidelity, chronological play-by-play event log.

Quadball Key Rules & Event Guidelines:
1. Identifying Teams: Establish which team is 'home' and which is 'away' based on jersey colors and colors visible in the film.
2. Clock Management:
   - 'gameStart': Log when play starts or restarts (e.g. at referee whistle or "Brooms up!").
   - 'gamePause': Log when play is stopped by referee whistle, cards, or timeouts.
   - 'gameEnd': Log when the final whistle blows or a team hits the target score / catch to end the match.
3. Scoring Events:
   - 'goal': A chaser/keeper throws or taps the quaffle/quadball through one of the 3 hoops (10 points). Specify the scoring player's jersey number.
   - 'assist': If a pass immediately prior to the goal directly set up the score, log a separate 'assist' event (or a goal with 'assistedByPlayerJersey').
   - 'shot': A shot attempt at the hoops that is missed, blocked, or saved.
4. Possessions & Turnovers:
   - 'turnover': Any loss of quaffle/quadball possession from one team to another (drops, bad passes, interceptions, strip steals).
5. Dodgeball / Bludger Control:
   - 'control_change': Bludger control refers to having 2 of the 3 bludgers. When a team successfully secures or loses bludger control, log a 'control_change' specifying which team now holds control.
6. Seekers & Flag (Snitch):
   - 'flag_released': The seeker flag runner (snitch) enters the field, and/or seekers are released to chase them.
   - 'flag_catch': A seeker successfully catches the flag runner's tail (worth 35 points, ends the game).
7. Substitutions:
   - 'sub_in' / 'sub_out': When players swap on the fly or during stoppages. Identify their position (chaser, keeper, beater, seeker) and jersey numbers if visible.

Be extremely precise with timestamps. Chronology is crucial. Follow the provided JSON schema exactly.`;

    const fileUri = uploadFile.uri || uploadFile.file?.uri || fileInfo.uri || fileInfo.file?.uri;
    const fileMimeType = uploadFile.mimeType || uploadFile.file?.mimeType || fileInfo.mimeType || fileInfo.file?.mimeType;

    if (!fileUri || !fileMimeType) {
      throw new Error(`Could not resolve file URI or MIME type for the uploaded video.`);
    }

    // Determine duration
    let durationSeconds = 1200; // default 20 minutes
    if (fileInfo.videoMetadata?.videoDuration) {
      const durationStr = fileInfo.videoMetadata.videoDuration;
      durationSeconds = parseFloat(durationStr);
      console.log(`[Window Sweep] Detected video duration from metadata: ${durationStr} (${durationSeconds} seconds)`);
    } else {
      console.log(`[Window Sweep] No duration metadata found. Defaulting to 20-minute sweep (1200 seconds).`);
    }

    // Sweep settings
    const segmentSizeSeconds = 120; // 2 minutes
    const overlapSeconds = 10;      // 10 seconds overlap
    const totalSegments = Math.ceil(durationSeconds / segmentSizeSeconds);

    console.log(`\n\x1b[36m[Window Sweep] Sweeping video in ${totalSegments} sequential segments of 2 minutes (with 10s overlaps)...\x1b[0m`);

    const allEvents: any[] = [];
    let gameTitle = "Extracted Game";
    let homeTeamName = "Home Team";
    let awayTeamName = "Away Team";

    for (let i = 0; i < totalSegments; i++) {
      const start = i * segmentSizeSeconds;
      const end = Math.min(start + segmentSizeSeconds + overlapSeconds, durationSeconds);
      
      const startMin = Math.floor(start / 60);
      const startSec = start % 60;
      const endMin = Math.floor(end / 60);
      const endSec = end % 60;

      console.log(`\n\x1b[35m[Segment ${i + 1}/${totalSegments}] Sweeping window: ${startMin}:${String(startSec).padStart(2, '0')} to ${endMin}:${String(endSec).padStart(2, '0')} (${start}s - ${end}s)...\x1b[0m`);

      const segmentPromptText = `Watch the video specifically between ${start} seconds and ${end} seconds (${startMin}:${String(startSec).padStart(2, '0')} to ${endMin}:${String(endSec).padStart(2, '0')}).
      Extract all play-by-play events that occur STRICTLY within this timeframe. 
      Do not log any events outside this window. 
      Identify player jersey numbers, goals, shots, assists, substitutions, clock starts/stops, fouls, and card events.
      Output your analysis strictly in JSON format adhering to the response schema.`;

      let response;
      let attempts = 0;
      const maxAttempts = 2;
      
      while (attempts < maxAttempts) {
        try {
          response = await ai.models.generateContent({
            model: modelName,
            contents: [
              {
                fileData: {
                  mimeType: fileMimeType,
                  fileUri: fileUri
                }
              },
              { text: segmentPromptText }
            ],
            config: {
              systemInstruction: systemPrompt,
              responseMimeType: 'application/json',
              responseSchema: responseSchema,
              temperature: 0.1,
              maxOutputTokens: 8192
            }
          });
          break;
        } catch (err) {
          attempts++;
          console.warn(`  --> [Warning] API call failed, retrying in 5 seconds (attempt ${attempts}/${maxAttempts}): ${(err as Error).message}`);
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }

      if (!response) {
        console.error(`  --> \x1b[31m[Segment Error] Failed to analyze segment ${i + 1}. Skipping...\x1b[0m`);
        continue;
      }

      const responseText = response.text || '';
      let cleanText = responseText.trim();
      if (cleanText.startsWith('```')) {
        const match = cleanText.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
        if (match) {
          cleanText = match[1].trim();
        }
      }

      try {
        const healedText = healTruncatedJson(cleanText);
        const parsedData = JSON.parse(healedText);
        
        if (parsedData.gameTitle && parsedData.gameTitle !== 'Extracted Game' && parsedData.gameTitle !== 'Team A vs Team B') gameTitle = parsedData.gameTitle;
        if (parsedData.homeTeamName && parsedData.homeTeamName !== 'Home Team') homeTeamName = parsedData.homeTeamName;
        if (parsedData.awayTeamName && parsedData.awayTeamName !== 'Away Team') awayTeamName = parsedData.awayTeamName;

        if (parsedData.events && Array.isArray(parsedData.events)) {
          // Filter events to only keep those that fall within the current segment's core range (start to start + segmentSizeSeconds)
          // to avoid double-logging events captured in the overlap zone.
          const coreEnd = start + segmentSizeSeconds;
          const segmentEvents = parsedData.events.filter((ev: any) => {
            const time = parseInt(ev.videoTime, 10);
            return time >= start && time < coreEnd;
          });
          
          console.log(`  --> Extracted ${parsedData.events.length} events (${segmentEvents.length} in core segment window).`);
          allEvents.push(...segmentEvents);
        }
      } catch (parseErr) {
        console.error(`  --> \x1b[31mFailed to parse JSON for segment ${i + 1}\x1b[0m: ${(parseErr as Error).message}`);
        
        const failedFilePath = path.resolve(process.cwd(), `ai_extracted_events_failed_seg_${i + 1}.json`);
        fs.writeFileSync(failedFilePath, responseText, 'utf-8');
      }
    }

    console.log(`\n\x1b[36m[Window Sweep] Completed all window queries.\x1b[0m`);
    console.log(`[Window Sweep] Total raw core events collected: ${allEvents.length}`);

    // De-duplicate: Keep only unique events
    const uniqueEvents: any[] = [];
    const seenSignatures = new Set<string>();

    for (const ev of allEvents) {
      if (!ev.videoTime || !ev.type || !ev.team) continue;
      
      const videoTime = parseInt(ev.videoTime, 10) || 0;
      const type = ev.type;
      const team = ev.team;
      const playerJersey = ev.playerJersey || '';
      
      // Check 2 seconds tolerance signature
      const normalizedTime = Math.floor(videoTime / 2) * 2;
      const signature = `${normalizedTime}_${type}_${team}_${playerJersey}`;

      if (!seenSignatures.has(signature)) {
        seenSignatures.add(signature);
        uniqueEvents.push({
          ...ev,
          videoTime
        });
      }
    }

    // Sort chronologically by videoTime
    uniqueEvents.sort((a, b) => a.videoTime - b.videoTime);

    const finalOutput = {
      gameTitle,
      homeTeamName,
      awayTeamName,
      events: uniqueEvents
    };

    const outputFilePath = path.resolve(process.cwd(), 'ai_extracted_events.json');
    fs.writeFileSync(outputFilePath, JSON.stringify(finalOutput, null, 2), 'utf-8');

    console.log(`\n\x1b[32m[Output Saved] Successfully merged, de-duplicated, and sorted play-by-play events!\x1b[0m`);
    console.log(`  Saved to: ${outputFilePath}`);
    console.log(`  Extracted Game: ${finalOutput.gameTitle}`);
    console.log(`  Home Team: ${finalOutput.homeTeamName}`);
    console.log(`  Away Team: ${finalOutput.awayTeamName}`);
    console.log(`  Total De-duplicated Events: ${finalOutput.events.length}`);

  } catch (err) {
    console.error(`\x1b[31m[Error during extraction]\x1b[0m`, err);
  } finally {
    // Always clean up/delete the file from Gemini File Manager to maintain storage limits
    if (uploadFile) {
      try {
        console.log(`\n\x1b[36m[Gemini Cleanup] Deleting video file from Gemini cloud server (${uploadFile.name})...\x1b[0m`);
        await ai.files.delete({ name: uploadFile.name });
        console.log(`\x1b[32m[Gemini Cleanup] Video file removed from server successfully.\x1b[0m`);
      } catch (cleanupErr) {
        console.error(`[Warning] Failed to delete file ${uploadFile.name} from Gemini cloud storage:`, cleanupErr);
      }
    }
  }
}

run();
