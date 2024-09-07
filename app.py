import os
from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO, emit
from google.cloud import speech
import numpy as np
import logging
from werkzeug.utils import secure_filename
from datetime import datetime
import wave
import queue
import threading
import pyaudio
from fuzzywuzzy import fuzz
import re

# Set up logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")

# Load environment variables
from dotenv import load_dotenv
load_dotenv()

# Set the path to your service account JSON file
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "credentials.json"

if not os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
    raise EnvironmentError("GOOGLE_APPLICATION_CREDENTIALS is not set. Please set this environment variable.")

def get_speech_client():
    if not hasattr(get_speech_client, 'client'):
        get_speech_client.client = speech.SpeechClient()
    return get_speech_client.client

# Audio recording parameters
RATE = 16000
CHUNK = int(RATE / 10)  # 100ms

DITTO_SENTENCE = "Ditto becomes smarter and more accurate the more people use it. If Ditto makes mistakes, corrections allows Ditto to learn and do better next time."
DITTO_WORDS = re.findall(r'\w+', DITTO_SENTENCE.lower())

last_matched_index = 0

def fuzzy_match_ditto_sentence(transcript):
    transcript_words = re.findall(r'\w+', transcript.lower())
    max_matched_index = 0
    current_match_index = 0
    matched_words = []

    for i, word in enumerate(transcript_words):
        if current_match_index >= len(DITTO_WORDS):
            break

        if fuzzy_match(word, DITTO_WORDS[current_match_index]):
            matched_words.append(DITTO_WORDS[current_match_index])
            current_match_index += 1
            if current_match_index > max_matched_index:
                max_matched_index = current_match_index
        else:
            current_match_index = 0
            matched_words = []

    return max_matched_index, ' '.join(matched_words)

def fuzzy_match(str1, str2):
    threshold = 80  # Adjust this value to change the matching sensitivity
    return fuzz.ratio(str1, str2) >= threshold

class MicrophoneStream:
    def __init__(self, rate=RATE, chunk=CHUNK):
        self._rate = rate
        self._chunk = chunk
        self._buff = queue.Queue()
        self.closed = True

    def __enter__(self):
        self._audio_interface = pyaudio.PyAudio()
        self._audio_stream = self._audio_interface.open(
            format=pyaudio.paInt16,
            channels=1,
            rate=self._rate,
            input=True,
            frames_per_buffer=self._chunk,
            stream_callback=self._fill_buffer,
        )
        self.closed = False
        return self

    def __exit__(self, type, value, traceback):
        self._audio_stream.stop_stream()
        self._audio_stream.close()
        self.closed = True
        self._buff.put(None)
        self._audio_interface.terminate()

    def _fill_buffer(self, in_data, frame_count, time_info, status_flags):
        self._buff.put(in_data)
        return None, pyaudio.paContinue

    def generator(self):
        while not self.closed:
            chunk = self._buff.get()
            if chunk is None:
                return
            data = [chunk]
            while True:
                try:
                    chunk = self._buff.get(block=False)
                    if chunk is None:
                        return
                    data.append(chunk)
                except queue.Empty:
                    break
            yield b''.join(data)

audio_stream = None
stop_transcription = threading.Event()
transcription_mode = "realtime"

# Create the data/audio_output folder if it doesn't exist
AUDIO_OUTPUT_FOLDER = os.path.join('data', 'audio_output')
os.makedirs(AUDIO_OUTPUT_FOLDER, exist_ok=True)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/save_audio', methods=['POST'])
def save_audio():
    if 'audio' not in request.files:
        return jsonify({'error': 'No audio file'}), 400
    
    audio_file = request.files['audio']
    if audio_file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    
    if audio_file:
        filename = secure_filename(f"recording_{datetime.now().strftime('%Y%m%d_%H%M%S')}.wav")
        filepath = os.path.join(AUDIO_OUTPUT_FOLDER, filename)
        audio_file.save(filepath)
        
        logger.info(f"Audio saved: {filepath}")
        return jsonify({'filename': filename}), 200

@socketio.on('connect')
def handle_connect():
    logger.info("Client connected")
    emit('server_message', {'data': 'Connected to server'})

@socketio.on('start_recording')
def handle_start_recording(data):
    global transcription_mode, audio_stream
    transcription_mode = data['mode']
    logger.info(f"Starting recording in {transcription_mode} mode")
    stop_transcription.clear()
    if transcription_mode == 'realtime':
        audio_stream = MicrophoneStream()
        socketio.start_background_task(transcribe_audio_stream)
    logger.info("Recording started")
    socketio.emit('debug', {'message': 'Recording started'}, namespace='/')

@socketio.on('stop_recording')
def handle_stop_recording():
    logger.info("Stopping recording")
    stop_transcription.set()
    global audio_stream
    if audio_stream:
        audio_stream.closed = True
    logger.info("Recording stopped")

@socketio.on('audio_data')
def handle_audio_data(data):
    try:
        if data['mode'] == 'batch':
            audio_data = np.frombuffer(data['audio'], dtype=np.int16)
            logger.info(f"Received batch audio data length: {len(audio_data)}")
            transcribe_audio_batch(audio_data, data['sampleRate'])
    except Exception as e:
        logger.error(f"Error processing audio data: {e}")
        socketio.emit('error', {'message': 'Error processing audio data'})

def transcribe_audio_batch(audio_data, sample_rate):
    try:
        logger.info(f"Starting batch transcription with {len(audio_data)} samples at {sample_rate} Hz")
        
        audio = speech.RecognitionAudio(content=audio_data.tobytes())
        config = speech.RecognitionConfig(
            encoding=speech.RecognitionConfig.AudioEncoding.LINEAR16,
            sample_rate_hertz=sample_rate,
            language_code="en-US"
        )

        logger.info("Sending batch recognition request")
        response = get_speech_client().recognize(config=config, audio=audio)
        logger.info(f"Received batch response: {response}")

        for result in response.results:
            transcript = result.alternatives[0].transcript
            logger.info(f"Batch transcription: {transcript}")
            socketio.emit('transcription', {'text': transcript, 'is_final': True})
    except Exception as e:
        logger.error(f"Error in batch recognition: {str(e)}")
        socketio.emit('error', {'message': f"Transcription error: {str(e)}"})

def transcribe_audio_stream():
    focus_words = [
        "Ditto"
    ]
    speech_context = speech.SpeechContext(phrases=focus_words)

    global audio_stream
    client = get_speech_client()
    config = speech.RecognitionConfig(
        encoding=speech.RecognitionConfig.AudioEncoding.LINEAR16,
        sample_rate_hertz=RATE,
        language_code="en-US",
        enable_automatic_punctuation=True,
        speech_contexts=[speech_context]  # Add the speech context here
    )
    streaming_config = speech.StreamingRecognitionConfig(
        config=config, interim_results=True
    )

    logger.info("Starting audio stream transcription")
    with audio_stream:
        audio_generator = audio_stream.generator()
        requests = (speech.StreamingRecognizeRequest(audio_content=content)
                    for content in audio_generator)

        try:
            responses = client.streaming_recognize(streaming_config, requests)
            
            for response in responses:
                if stop_transcription.is_set():
                    logger.info("Transcription stopped")
                    break
                if not response.results:
                    continue

                result = response.results[0]
                if not result.alternatives:
                    continue

                transcript = result.alternatives[0].transcript
                is_final = result.is_final

                matched_index, matched_words = fuzzy_match_ditto_sentence(transcript)
                logger.info(f"Transcription: {transcript} ({'final' if is_final else 'interim'})")
                logger.info(f"Matched index: {matched_index}")
                logger.info(f"Matched words: {matched_words}")

                socketio.emit('transcription_update', {
                    'text': transcript, 
                    'is_final': is_final,
                    'matched_index': matched_index
                })
                socketio.sleep(0)  # Allow other threads to run

        except Exception as e:
            logger.error(f"Error in streaming recognition: {str(e)}")
            socketio.emit('error', {'message': f"Streaming error: {str(e)}"})
    
    logger.info("Audio stream transcription ended")

def process_fuzzy_match(transcript):
    global last_matched_index
    matched_words = fuzzy_match_ditto_sentence(transcript)
    if matched_words > last_matched_index:
        socketio.emit('ditto_match', {'matched_words': matched_words}, namespace='/')

@socketio.on_error_default
def default_error_handler(e):
    logger.error(f"SocketIO error: {str(e)}", exc_info=True)
    return str(e)

@socketio.on('ping')
def handle_ping(timestamp):
    emit('pong', timestamp)

if __name__ == '__main__':
    print("Starting the application...")
    socketio.run(app, debug=True, port=5010)
    print("Application has started.")