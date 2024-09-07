let socket = io();
let isRecording = false;
let transcriptText = '';
let currentLanguage = 'en-US';

const DITTO_SENTENCE = "Ditto becomes smarter and more accurate the more people use it";

document.addEventListener('DOMContentLoaded', function() {
    const recordButton = document.getElementById('recordButton');
    if (recordButton) {
        recordButton.addEventListener('click', toggleRecording);
        console.log("Record button event listener added");
    } else {
        console.error("Record button not found in the DOM");
    }

    checkTranscriptionBox();
    initializeDittoSentence();
    resetHighlighting();

    const languageSelect = document.getElementById('languageSelect');
    if (languageSelect) {
        languageSelect.addEventListener('change', function() {
            currentLanguage = this.value;
            console.log("Language changed to:", currentLanguage);
            // If you want to restart recording when language changes, call stopRecording() here
        });
    } else {
        console.error("Language select not found in the DOM");
    }
});

function toggleRecording() {
    if (isRecording) {
        stopRecording();
    } else {
        startRecording();
    }
}

function startRecording() {
    console.log("Starting recording");
    isRecording = true;
    updateRecordButtonState(true);
    transcriptText = '';
    updateTranscriptionBox('');
    
    let mode = document.getElementById('transcriptionMode').value;
    console.log("Emitting start_recording event with mode:", mode, "and language:", currentLanguage);
    socket.emit('start_recording', { mode: mode, language: currentLanguage });
}

function stopRecording() {
    console.log("Stopping recording");
    isRecording = false;
    updateRecordButtonState(false);
    socket.emit('stop_recording');
}

function updateRecordButtonState(isRecording) {
    const recordButton = document.getElementById('recordButton');
    const icon = recordButton.querySelector('i');
    
    if (isRecording) {
        recordButton.classList.add('recording');
        icon.textContent = 'stop';  // Change to stop icon
    } else {
        recordButton.classList.remove('recording');
        icon.textContent = 'mic';  // Change back to mic icon
    }
}

socket.on('connect', function() {
    console.log('Connected to server');
});

socket.on('server_message', function(data) {
    console.log('Server message:', data.data);
});

socket.on('transcription_update', function(data) {
    console.log("Received transcription update:", data);
    updateTranscriptionBox(data.text, data.is_final);
    updateDittoSentenceHighlight(data.matched_index);
});

socket.on('reset_highlighting', function() {
    console.log("Resetting highlighting");
    resetHighlighting();
});

function updateTranscriptionBox(text, isFinal) {
    const transcriptionDiv = document.getElementById('transcriptionText');
    if (transcriptionDiv) {
        if (isFinal) {
            transcriptText += text + ' ';
        }
        let displayText = transcriptText + (isFinal ? '' : text);
        transcriptionDiv.textContent = displayText;
        console.log("Updated transcription box:", displayText);
    } else {
        console.error("Transcription box not found");
    }
}

function initializeDittoSentence() {
    const dittoSentenceDiv = document.getElementById('ditto-sentence');
    if (dittoSentenceDiv) {
        dittoSentenceDiv.innerHTML = DITTO_SENTENCE.split(' ').map(word => `<span>${word}</span>`).join(' ');
    } else {
        console.error("Ditto sentence div not found");
    }
}

function updateDittoSentenceHighlight(matchedIndex) {
    const dittoSentenceDiv = document.getElementById('ditto-sentence');
    if (dittoSentenceDiv) {
        const words = dittoSentenceDiv.querySelectorAll('span');
        words.forEach((word, index) => {
            if (index < matchedIndex) {
                word.style.backgroundColor = 'yellow';
            } else {
                word.style.backgroundColor = 'transparent';
            }
        });
    } else {
        console.error("Ditto sentence div not found");
    }
}

function resetHighlighting() {
    updateDittoSentenceHighlight(0);
    updateTranscriptionBox('');
}

function checkTranscriptionBox() {
    const transcriptionDiv = document.getElementById('transcriptionText');
    if (!transcriptionDiv) {
        console.error("Transcription box not found in the DOM");
    } else {
        console.log("Transcription box found:", transcriptionDiv);
    }
}

// Add error handling for socket connection
socket.on('connect_error', (error) => {
    console.error('Connection error:', error);
});

socket.on('error', (error) => {
    console.error('Socket error:', error);
});

// Test function
function testTranscriptionBox() {
    console.log("Testing transcription box update");
    updateTranscriptionBox("This is a test transcription.", true, 3);
}

// Call test function when page loads
document.addEventListener('DOMContentLoaded', function() {
    testTranscriptionBox();
});