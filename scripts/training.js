/*// Parameters
const inputSize = 6; // [robot x, y, angle, vx, vy, timeLeft]
const numActions = 6; // [forward, backward, left, right, grab (j/mouseDown), score (t)]
const temporalWindow = 1;
const networkSize = inputSize * temporalWindow + numActions * temporalWindow + inputSize;

const layer_defs = [];
layer_defs.push({type:'input', out_sx:1, out_sy:1, out_depth:networkSize});
layer_defs.push({type:'fc', num_neurons:40, activation:'relu'});
layer_defs.push({type:'fc', num_neurons:40, activation:'relu'});
layer_defs.push({type:'regression', num_neurons:numActions});

const tdtrainer_options = {learning_rate:0.001, momentum:0.0, batch_size:64, l2_decay:0.01};
const opt = {
  temporal_window: temporalWindow,
  experience_size: 10000,
  start_learn_threshold: 1000,
  gamma: 0.99,
  learning_steps_total: 200000,
  learning_steps_burnin: 1000,
  epsilon_min: 0.05,
  epsilon_test_time: 0.05
};

const brain = new deepqlearn.Brain(inputSize, numActions, opt);
brain.value_net = new convnetjs.Net();
brain.value_net.makeLayers(layer_defs);
brain.tdtrainer = new convnetjs.SGDTrainer(brain.value_net, tdtrainer_options);

// --- Helper to get game state ---
function getState() {
    // You may want to add more features for better learning
    const rb = window.robot;
    return [
        rb.position.x / 600, // normalize to field size
        rb.position.y / 600,
        Math.sin(rb.angle), // angle as sin/cos
        Math.cos(rb.angle),
        rb.velocity.x / 10,
        rb.velocity.y / 10,
        (window.timeLeft || 0) / 120 // normalized time left
    ];
}

// --- Helper to set action(s) ---
// Only control robot1 (window.robot)
function setAction(actionArr) {
    // actionArr: array of Q-values for each action
    // Actions: [w, s, a, d, j/mouseDown, t]
    // Only set keys/mouse for robot1 (window.robot)
    Object.keys(window.keys).forEach(k => window.keys[k] = false);
    window.mouseDown = false;
    window.rightMouseDown = false;

    // Threshold for activation
    const maxVal = Math.max(...actionArr);
    // If all actions are zero, do nothing
    if (maxVal <= 0) return;
    const threshold = 0.5 * maxVal;

    if (actionArr[0] >= threshold) window.keys.w = true;
    if (actionArr[1] >= threshold) window.keys.s = true;
    if (actionArr[2] >= threshold) window.keys.a = true;
    if (actionArr[3] >= threshold) window.keys.d = true;
    if (actionArr[4] >= threshold) { window.keys.j = true; window.mouseDown = true; }
    if (actionArr[5] >= threshold) window.keys.t = true;

    // --- Force update of robot movement immediately ---
    // This is necessary because the game only reads keys during event listeners,
    // but here we are setting them programmatically.
    // So, we need to manually trigger the robot movement logic.
    // We'll call the beforeUpdate handler directly if possible.
    if (typeof Matter !== "undefined" && Matter.Events && window.engine) {
        Matter.Events.trigger(window.engine, 'beforeUpdate', {});
    }
}

// --- Reward function ---
function getReward(prevScore, prevX, prevY) {
    // Reward for increasing score, or moving forward
    const score = (window.getScore ? window.getScore() : 0);
    let reward = score - prevScore;
    // Encourage movement toward field center
    const rb = window.robot;
    reward += 0.01 * (600 - Math.abs(rb.position.x - 300) - Math.abs(rb.position.y - 300));
    return reward;
}

// --- Main training loop ---
let prevState = getState();
let prevAction = 0;
let prevScore = 0;
let prevX = window.robot.position.x;
let prevY = window.robot.position.y;

function trainingStep() {
    // Start the game if not running
    if (!window.timerActive || window.timeLeft <= 0) {
        // Reset and start game automatically
        if (window.resetField) window.resetField();
        // Wait a bit for reset to finish
        setTimeout(() => {
            if (window.startGame) window.startGame();
            setTimeout(trainingStep, 500);
        }, 500);
        return;
    }
    // Observe reward
    const reward = getReward(prevScore, prevX, prevY);
    // Forward step
    const state = getState();
    const actionArr = brain.forward(state); // returns array of Q-values
    setAction(actionArr);

    // Learn
    brain.backward(reward);

    // Save for next step
    prevState = state;
    prevAction = actionArr;
    prevScore = (window.getScore ? window.getScore() : 0);
    prevX = window.robot.position.x;
    prevY = window.robot.position.y;

    // Next step
    setTimeout(trainingStep, 50); // ~20Hz

}

// Start training after a short delay to allow game to load
setTimeout(trainingStep, 2000);*/