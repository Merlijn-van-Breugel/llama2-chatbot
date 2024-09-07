let socket = io();
let isRecording = false;
let finalTranscript = '';
let interimTranscript = '';
const dittoSentence = "Ditto becomes smarter and more accurate the more people use it. If Ditto makes mistakes, corrections allows Ditto to learn and do better next time.";
const dittoWords = dittoSentence.split(' ');
let currentMatchedWords = 0;

document.getElementById('recordButton').addEventListener('click', function() {
    if (isRecording) {
        stopRecording();
    } else {
        startRecording();
    }
});

function startRecording() {
    console.log("Starting recording");
    isRecording = true;
    updateRecordButtonState(true);
    finalTranscript = '';
    interimTranscript = '';
    currentMatchedWords = 0;
    document.getElementById('transcription').innerHTML = '';
    updateDittoSentence(0);
    
    let mode = document.getElementById('transcriptionMode').value;
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

socket.on('transcription', function(data) {
    console.log("Received transcription:", data);
    const transcriptionDiv = document.getElementById('transcription');
    
    if (data.is_final) {
        finalTranscript += data.text + ' ';
        interimTranscript = '';
    } else {
        interimTranscript = data.text;
    }
    
    transcriptionDiv.innerHTML = finalTranscript + '<span class="interim">' + interimTranscript + '</span>';
});

socket.on('ditto_match', function(data) {
    console.log("Received ditto match:", data);
    if (data.matched_words > currentMatchedWords) {
        updateDittoSentence(data.matched_words);
        currentMatchedWords = data.matched_words;
    }
});

function updateDittoSentence(matchedWords) {
    console.log("Updating Ditto sentence, matched words:", matchedWords);
    const dittoSentenceDiv = document.getElementById('ditto-sentence');
    const highlightedWords = dittoWords.map((word, index) => 
        index < matchedWords ? `<span class="matched-word">${word}</span>` : word
    );
    dittoSentenceDiv.querySelector('.mdl-card__supporting-text').innerHTML = highlightedWords.join(' ');
}

socket.on('error', function(data) {
    console.error('Server error:', data.message);
    alert('An error occurred: ' + data.message);
});