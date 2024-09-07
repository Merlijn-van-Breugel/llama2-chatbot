document.addEventListener('DOMContentLoaded', () => {
    const toggleButton = document.getElementById('toggleRecording');
    const transcriptionMode = document.getElementById('transcriptionMode');
    const transcriptionDiv = document.getElementById('transcription');

    let socket = io();
    let mediaRecorder;
    let audioChunks = [];
    let isRecording = false;

    toggleButton.addEventListener('click', toggleRecording);

    function toggleRecording() {
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    }

    function startRecording() {
        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(stream => {
                mediaRecorder = new MediaRecorder(stream);
                mediaRecorder.ondataavailable = event => {
                    audioChunks.push(event.data);
                    if (audioChunks.length > 10) {
                        const audioBlob = new Blob(audioChunks);
                        socket.emit('audio_chunk', audioBlob);
                        audioChunks = [];
                    }
                };
                mediaRecorder.start(100);
                isRecording = true;
                toggleButton.textContent = 'Stop Recording';
                socket.emit('start_transcription', { mode: transcriptionMode.value });
            })
            .catch(error => {
                console.error('Error accessing microphone:', error);
            });
    }

    function stopRecording() {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
            mediaRecorder.stream.getTracks().forEach(track => track.stop());
            isRecording = false;
            toggleButton.textContent = 'Start Recording';
            socket.emit('stop_transcription');
        }
    }

    socket.on('transcription_update', function(data) {
        transcriptionDiv.textContent = data.transcription;
    });
});