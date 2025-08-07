const debug = document.getElementById('debug');
const p = debug.querySelector('p');

function trainingStep() {
    let x = Math.round(user.position.x * 100) / 100;
    let y = Math.round(user.position.y * 100) / 100;
    let theta = Math.round(user.angle * 100) / 100;
    let attachedmogo = attachedMogo ? 'true' : 'false';
    // timeLeft, redScore, blueScore

    let velocityX = Math.round(user.velocity.x * 100) / 100;
    let velocityY = Math.round(user.velocity.y * 100) / 100;
    p.textContent = redScore + ' ' + blueScore;

    setTimeout(trainingStep, 50); // ~20Hz
}

setTimeout(trainingStep(), 200);