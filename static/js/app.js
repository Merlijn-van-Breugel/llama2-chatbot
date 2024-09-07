let socket = io();
let isRecording = false;
let transcriptText = '';

// Make sure this function is called when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', function() {
    const recordButton = document.getElementById('recordButton');
    if (recordButton) {
        recordButton.addEventListener('click', toggleRecording);
        console.log("Record button event listener added");
    } else {
        console.error("Record button not found in the DOM");
    }

    checkTranscriptionBox();
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
    console.log("Emitting start_recording event with mode:", mode);
    socket.emit('start_recording', { mode: mode });
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
});

function updateTranscriptionBox(text, isFinal) {
    const transcriptionDiv = document.getElementById('transcriptionText');
    if (transcriptionDiv) {
        if (isFinal) {
            transcriptText += text + ' ';
        }
        transcriptionDiv.textContent = transcriptText + (isFinal ? '' : text);
        console.log("Updated transcription box:", transcriptionDiv.textContent);
    } else {
        console.error("Transcription box not found");
    }
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
    updateTranscriptionBox("This is a test transcription.", true);
}

// Call test function when page loads
document.addEventListener('DOMContentLoaded', function() {
    testTranscriptionBox();
});