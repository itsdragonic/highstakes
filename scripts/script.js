const inches = 4;
const FIELD_SIZE = 144 * inches;
const ROBOT_WIDTH = 14 * inches;
const ROBOT_HEIGHT = 16.5 * inches;
const BORDER_SIZE = 10;

const fieldImage = new Image();
fieldImage.src = "field.png";

const { Engine, Render, Runner, World, Bodies, Body, Events, Composite } = Matter;

const engine = Engine.create();
engine.gravity.x = 0;
engine.gravity.y = 0;
const world = engine.world;

const bgCanvas = document.getElementById('background-canvas');
const bgCtx = bgCanvas.getContext('2d');
bgCanvas.width = FIELD_SIZE + BORDER_SIZE * 2;
bgCanvas.height = FIELD_SIZE + BORDER_SIZE * 2;

const render = Render.create({
    canvas: document.getElementById('game-canvas'),
    engine: engine,
    options: {
        width: FIELD_SIZE,
        height: FIELD_SIZE,
        wireframes: false,
        background: 'transparent',
        showAngleIndicator: false
    }
});

window.addEventListener('resize', positionBackground);
drawBackground();
positionBackground();

// Create robot(s)
const robot = Bodies.rectangle(50, 400, ROBOT_HEIGHT, ROBOT_WIDTH, {
    frictionAir: 0.2,
    render: {
        fillStyle: '#0077ff',
        visible: true
    }
});

// Create Pillars
const thickness = 20;
const boundaries = [
    Bodies.rectangle(FIELD_SIZE / 2, -thickness / 2, FIELD_SIZE, thickness, { isStatic: true }),
    Bodies.rectangle(FIELD_SIZE / 2, FIELD_SIZE + thickness / 2, FIELD_SIZE, thickness, { isStatic: true }),
    Bodies.rectangle(-thickness / 2, FIELD_SIZE / 2, thickness, FIELD_SIZE, { isStatic: true }),
    Bodies.rectangle(FIELD_SIZE + thickness / 2, FIELD_SIZE / 2, thickness, FIELD_SIZE, { isStatic: true })
];

const pillarPositions = [
    // Ladder pillars
    { x: 72, y: 48, radius: 4 * inches },
    { x: 72, y: 97, radius: 4 * inches },
    { x: 48, y: 72, radius: 4 * inches },
    { x: 97, y: 72, radius: 4 * inches },

    // Alliance and wall stakes
    {x: 0, y: 72, radius: 2 * inches}, // red alliance stake with a red ring
    {x: 144, y: 72, radius: 2 * inches}, // blue alliance stake
    {x: 72, y: 0, radius: 2 * inches}, // top wall stake with preplaced red ring
    {x: 72, y: 144, radius: 2 * inches} // bottom wall stake with preplaced blue ring
];

// Add rings property to pillar bodies if present in pillarPositions
const pillars = pillarPositions.map(pos => {
    const body = Bodies.circle(
        pos.x * inches,
        pos.y * inches,
        pos.radius,
        {
            isStatic: true,
            render: { fillStyle: 'transparent', visible: true }
        }
    );
    if (pos.rings) body.rings = [...pos.rings];
    return body;
});

// Create Mobile Goals (mogos)
const MOGO_RADIUS = 6 * inches;
const MOGO_COLOR = '#bcc927';
const mogoPositions = [
    { x: 48, y: 48 },
    { x: 96, y: 48 },
    { x: 48, y: 96 },
    { x: 96, y: 96 },
    { x: 72, y: 121 },
];

// Add a blue ring to the first mogo for testing
let mogos = mogoPositions.map((pos, i) => {
    const body = createMogo(pos.x * inches, pos.y * inches);
    body.rings = [];
    return body;
});

// Create Rings
const red = '#bc232c';
const blue = '#286fb5';

const RING_OUTER_RADIUS = 7 / 2 * inches;
const RING_INNER_RADIUS = RING_OUTER_RADIUS - (2 * inches);
const RING_POSITIONS = [
    // corners
    { x: 4, y: 4, color: blue, rings: ["red","blue","red"] },
    { x: 140, y: 4, color: red, rings: ["blue","red","blue"] },
    { x: 4, y: 140, color: blue, rings: ["red","blue","red"] },
    { x: 140, y: 140, color: red, rings: ["blue","red","blue"] },

    // negative side
    { x: 69, y: 20, color: blue, rings: ["red"] },
    { x: 69, y: 27, color: blue, rings: ["red"] },
    { x: 76, y: 20, color: red, rings: ["blue"] },
    { x: 76, y: 27, color: red, rings: ["blue"] },

    { x: 48, y: 23, color: blue, rings: ["red"] },
    { x: 96, y: 23, color: red, rings: ["blue"] },

    // positive side
    { x: 121, y: 121, color: red },
    { x: 23, y: 121, color: blue },
    { x: 48, y: 121, color: blue, rings: ["red"] },
    { x: 96, y: 121, color: red, rings: ["blue"] },

    // alliance sides
    { x: 132, y: 73, color: red },
    { x: 12, y: 73, color: blue },
    { x: 121, y: 73, color: blue, rings: ["red"] },
    { x: 23, y: 73, color: red, rings: ["blue"] },

    // center
    { x: 69, y: 70, color: blue },
    { x: 69, y: 76, color: blue },
    { x: 76, y: 70, color: red },
    { x: 76, y: 76, color: red },
];

const rings = RING_POSITIONS.map(({ x, y, color, rings }, i) => {
    const outer = Bodies.circle(x * inches, y * inches, RING_OUTER_RADIUS, {
        isSensor: false,
        friction: 1.0,
        frictionStatic: 1.0,
        restitution: 0,
        density: 0.05,
        render: { visible: false }
    });
    const inner = Bodies.circle(x * inches, y * inches, RING_INNER_RADIUS, {
        isSensor: true,
        render: { visible: false }
    });
    // Use rings property if present
    if (rings && Array.isArray(rings)) outer.rings = [...rings];
    return { outer, inner, color };
});

rings.forEach(ring => {
    World.add(world, [ring.outer, ring.inner]);
});

// Add this after rings.forEach(ring => { World.add(world, [ring.outer, ring.inner]); }); and before World.add(world, ...)
Events.on(engine, 'collisionStart', function(event) {
    const velocityThreshold = 2.0; // adjust as needed for "scattering"
    const margin = RING_OUTER_RADIUS + 2; // margin to keep rings inside field
    event.pairs.forEach(pair => {
        let robotBody = null, ringBody = null, ringObj = null;
        // Find if robot is involved and which ring (outer) is involved
        if (pair.bodyA === robot) {
            robotBody = pair.bodyA;
            ringObj = rings.find(r => r.outer === pair.bodyB);
            ringBody = pair.bodyB;
        } else if (pair.bodyB === robot) {
            robotBody = pair.bodyB;
            ringObj = rings.find(r => r.outer === pair.bodyA);
            ringBody = pair.bodyA;
        }
        if (robotBody && ringObj && ringObj.outer.rings && Array.isArray(ringObj.outer.rings) && ringObj.outer.rings.length > 0) {
            // Check robot velocity magnitude
            const v = Math.sqrt(robot.velocity.x * robot.velocity.x + robot.velocity.y * robot.velocity.y);
            if (v > velocityThreshold) {
                // Scatter all rings in the array
                const baseX = ringObj.outer.position.x;
                const baseY = ringObj.outer.position.y;
                const angleStep = (2 * Math.PI) / Math.max(1, ringObj.outer.rings.length);
                for (let i = 0; i < ringObj.outer.rings.length; ++i) {
                    const colorName = ringObj.outer.rings[i];
                    const color = colorName === "red" ? red : blue;
                    // Spread out in a circle
                    const angle = i * angleStep + Math.random() * 0.2;
                    const scatterDist = 12 + Math.random() * 8;
                    // Clamp spawn position inside field
                    let x = baseX + Math.cos(angle) * scatterDist;
                    let y = baseY + Math.sin(angle) * scatterDist;
                    x = Math.max(margin, Math.min(FIELD_SIZE - margin, x));
                    y = Math.max(margin, Math.min(FIELD_SIZE - margin, y));
                    const outer = Bodies.circle(x, y, RING_OUTER_RADIUS, {
                        isSensor: false,
                        friction: 1.0,
                        frictionStatic: 1.0,
                        restitution: 0.5,
                        density: 0.05,
                        render: { visible: false }
                    });
                    const inner = Bodies.circle(x, y, RING_INNER_RADIUS, {
                        isSensor: true,
                        render: { visible: false }
                    });
                    rings.push({ outer, inner, color });
                    World.add(world, [outer, inner]);
                    // Give a random velocity for scatter effect
                    Body.setVelocity(outer, {
                        x: robot.velocity.x + Math.cos(angle) * (1.5 + Math.random()),
                        y: robot.velocity.y + Math.sin(angle) * (1.5 + Math.random())
                    });
                    Body.setAngularVelocity(outer, (Math.random() - 0.5) * 0.2);
                }
                // Clear the array
                ringObj.outer.rings = [];
            }
        }
    });
});

World.add(world, [robot, ...boundaries, ...pillars, ...mogos]);

// Timer/game state
let timerActive = false;
let timeLeft = 120; // seconds
let timerInterval = null;

const timerElem = document.getElementById('timer');
const startBtn = document.getElementById('start-btn');

function formatTime(secs) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function updateTimerDisplay() {
    if (timerElem) timerElem.textContent = formatTime(timeLeft);
}

function startGame() {
    if (timerActive) return;
    timerActive = true;
    timeLeft = 120;
    updateTimerDisplay();
    startBtn.disabled = true;
    timerInterval = setInterval(() => {
        if (timeLeft > 0) {
            timeLeft--;
            updateTimerDisplay();
            if (timeLeft === 0) {
                timerActive = false;
                startBtn.disabled = false;
                clearInterval(timerInterval);
            }
        }
    }, 1000);
}
if (startBtn) startBtn.addEventListener('click', startGame);
updateTimerDisplay();

const keys = { w: false, a: false, s: false, d: false, r: false, j: false, l: false, t: false };
let mouseDown = false;
let rightMouseDown = false;

document.addEventListener('keydown', e => {
    if (!timerActive || timeLeft <= 0) return;
    if (e.key in keys) keys[e.key] = true;
});
document.addEventListener('keyup', e => {
    if (!timerActive || timeLeft <= 0) return;
    if (e.key in keys) keys[e.key] = false;
});
document.addEventListener('mousedown', e => { 
    if (!timerActive || timeLeft <= 0) return;
    if (e.button === 0) mouseDown = true; 
    if (e.button === 2) rightMouseDown = true;
});
document.addEventListener('mouseup', e => { 
    if (!timerActive || timeLeft <= 0) return;
    if (e.button === 0) mouseDown = false; 
    if (e.button === 2) rightMouseDown = false;
});
// Prevent context menu on right click
document.addEventListener('contextmenu', e => e.preventDefault());

const forceMagnitude = 0.01;
const turnSpeed = 0.04;
let attachedMogo = null;
let lastRState = false;

// Animation state for grabbed rings
// Now also track if the animation has been "scored" or "ejected"
let animatingRings = [
    // Add a ring inside the robot at start (halfway through animation)
    {
        color: red, // or blue if you want blue instead
        start: performance.now(),
        relFrom: { x: ROBOT_HEIGHT / 2, y: 0 },
        relTo: { x: -ROBOT_HEIGHT * 0.6, y: 0 },
        relAngle: 0,
        elapsed: 0.5 * 600, // halfway through conveyorSpeed
        lastTimestamp: performance.now(),
        paused: true,
        direction: 0,
        ejectedFront: false,
        ejectedBack: false
    }
];
let conveyorSpeed = 600;

let wallStakeScoreHoldStart = null; // Track when t is first held for wall stake scoring

let lastRingPickupTime = 0; // timestamp of last ring pickup
const holdTime = 1500;

Events.on(engine, 'beforeUpdate', () => {
    // Prevent grabbing/releasing mogos if robot is pressed too far into an edge or corner
    function isRobotTooFarInEdgeOrCorner() {
        const margin = 2; // allow release very close to the edge
        // Check if robot's back (where mogo is grabbed/released) is too far outside field
        const backOffset = ROBOT_HEIGHT * 0.55;
        const backX = robot.position.x - Math.cos(robot.angle) * backOffset;
        const backY = robot.position.y - Math.sin(robot.angle) * backOffset;
        if (
            backX < margin ||
            backX > FIELD_SIZE - margin ||
            backY < margin ||
            backY > FIELD_SIZE - margin
        ) {
            return true;
        }
        return false;
    }

    function isPositionTooCloseToEdge(x, y, margin = 2) {
        return (
            x < margin ||
            x > FIELD_SIZE - margin ||
            y < margin ||
            y > FIELD_SIZE - margin
        );
    }

    if (keys.r !== lastRState) {
        if (keys.r) {
            if (isRobotTooFarInEdgeOrCorner()) {
                // Do nothing if too far in edge/corner
            } else if (!attachedMogo) {
                const backOffset = ROBOT_HEIGHT * 0.55;
                const backPosition = {
                    x: robot.position.x - Math.cos(robot.angle) * backOffset,
                    y: robot.position.y - Math.sin(robot.angle) * backOffset
                };
                let closestMogo = null;
                let closestDistance = MOGO_RADIUS * 1.3;
                let closestIndex = -1;
                mogos.forEach((mogo, index) => {
                    const distance = Matter.Vector.magnitude(Matter.Vector.sub(mogo.position, backPosition));
                    if (distance < closestDistance) {
                        closestDistance = distance;
                        closestMogo = mogo;
                        closestIndex = index;
                    }
                });
                if (closestMogo) {
                    World.remove(world, closestMogo);
                    mogos.splice(closestIndex, 1);
                    // Preserve rings array
                    attachedMogo = {
                        position: { x: backPosition.x, y: backPosition.y },
                        angle: robot.angle,
                        radius: MOGO_RADIUS,
                        color: MOGO_COLOR,
                        rings: (closestMogo.rings && Array.isArray(closestMogo.rings)) ? [...closestMogo.rings] : []
                    };
                }
            } else {
                // Only allow release if not too far in edge/corner
                const releaseOffset = ROBOT_HEIGHT;
                const releaseX = robot.position.x - Math.cos(robot.angle) * releaseOffset;
                const releaseY = robot.position.y - Math.sin(robot.angle) * releaseOffset;
                const margin = 2; // allow release very close to the edge
                if (
                    releaseX < margin ||
                    releaseX > FIELD_SIZE - margin ||
                    releaseY < margin ||
                    releaseY > FIELD_SIZE - margin
                ) {
                    // Do nothing if too far in edge/corner
                } else {
                    const newMogo = createMogo(releaseX, releaseY);
                    newMogo.rings = (attachedMogo.rings && Array.isArray(attachedMogo.rings)) ? [...attachedMogo.rings] : [];
                    mogos.push(newMogo);
                    World.add(world, newMogo);
                    attachedMogo = null;
                }
            }
        }
        lastRState = keys.r;
    }

    if (attachedMogo) {
        const offset = ROBOT_HEIGHT * 0.6;
        attachedMogo.position = {
            x: robot.position.x - Math.cos(robot.angle) * offset,
            y: robot.position.y - Math.sin(robot.angle) * offset
        };
        attachedMogo.angle = robot.angle;
    }

    // Only allow robot movement if timer is active and timeLeft > 0
    if (timerActive && timeLeft > 0) {
        if (keys.a) Body.setAngularVelocity(robot, -turnSpeed);
        if (keys.d) Body.setAngularVelocity(robot, turnSpeed);
        if (keys.w || keys.s) {
            const angle = robot.angle;
            const dir = keys.w ? 1 : -1;
            Body.applyForce(robot, robot.position, {
                x: Math.cos(angle) * forceMagnitude * dir,
                y: Math.sin(angle) * forceMagnitude * dir
            });
        }
        if (!keys.a && !keys.d) Body.setAngularVelocity(robot, 0);
    } else {
        // Prevent movement when timer is not active
        Body.setAngularVelocity(robot, 0);
    }

    // Ring grabbing: remove ring if in front and input is held
    if (keys.j || mouseDown) {
        const now = performance.now();
        if (now - lastRingPickupTime >= 500) { // 0.5s cooldown
            const frontOffset = ROBOT_HEIGHT / 2;
            const backOffset = -ROBOT_HEIGHT * 0.6;
            // Calculate RELATIVE front/back (relative to robot center, facing forward)
            const relFront = {
                x: Math.cos(robot.angle) * frontOffset,
                y: Math.sin(robot.angle) * frontOffset
            };
            const relBack = {
                x: Math.cos(robot.angle) * backOffset,
                y: Math.sin(robot.angle) * backOffset
            };
            // World positions for hit detection
            const frontPos = {
                x: robot.position.x + relFront.x,
                y: robot.position.y + relFront.y
            };
            for (let i = 0; i < rings.length; ++i) {
                const ring = rings[i];
                const dist = Matter.Vector.magnitude(Matter.Vector.sub(ring.outer.position, frontPos));
                if (dist < RING_OUTER_RADIUS + 8) {
                    // --- Virtual below logic using .rings property on outer body ---
                    if (ring.outer.rings && ring.outer.rings.length > 0) {
                        const belowColor = ring.outer.rings.pop();
                        animatingRings.push({
                            color: belowColor === "red" ? red : blue,
                            start: performance.now(),
                            relFrom: { x: frontOffset, y: 0 },
                            relTo: { x: backOffset, y: 0 },
                            relAngle: 0,
                            elapsed: 0,
                            lastTimestamp: performance.now(),
                            paused: false,
                            direction: 1, // 1 = forward, -1 = reverse
                            ejectedFront: false,
                            ejectedBack: false
                        });
                        lastRingPickupTime = now;
                        break;
                    }
                    // ...existing code...
                    World.remove(world, ring.outer);
                    World.remove(world, ring.inner);
                    animatingRings.push({
                        color: ring.color,
                        start: performance.now(),
                        relFrom: { x: frontOffset, y: 0 },
                        relTo: { x: backOffset, y: 0 },
                        relAngle: 0,
                        elapsed: 0,
                        lastTimestamp: performance.now(),
                        paused: false,
                        direction: 1, // 1 = forward, -1 = reverse
                        ejectedFront: false,
                        ejectedBack: false
                    });
                    rings.splice(i, 1);
                    lastRingPickupTime = now;
                    break;
                }
            }
        }
    }

    // Helper: find alliance stake adjacent to a given (x, y)
    function getAdjacentAllianceStake(x, y, margin = 12) {
        for (const pillar of pillars) {
            // Only alliance stakes (x=0 or x=144*inches, y=72*inches)
            if (
                (pillar.position.x === 0 || pillar.position.x === 144 * inches) &&
                pillar.position.y === 72 * inches
            ) {
                const dist = Matter.Vector.magnitude(Matter.Vector.sub({ x, y }, pillar.position));
                if (dist < (pillar.circleRadius || pillar.radius || 2 * inches) + margin) {
                    return pillar;
                }
            }
        }
        return null;
    }

    // Helper: find wall stake adjacent to a given (x, y)
    function getAdjacentWallStake(x, y, margin = 12) {
        for (const pillar of pillars) {
            // Only wall stakes (x=72*inches, y=0 or y=144*inches)
            if (
                pillar.position.x === 72 * inches &&
                (pillar.position.y === 0 || pillar.position.y === 144 * inches)
            ) {
                const dist = Matter.Vector.magnitude(Matter.Vector.sub({ x, y }, pillar.position));
                if (dist < (pillar.circleRadius || pillar.radius || 2 * inches) + margin) {
                    return pillar;
                }
            }
        }
        return null;
    }

    // Remove finished animations (after 1 second) and handle scoring/ejection
    const now = performance.now();
    for (let i = animatingRings.length - 1; i >= 0; --i) {
        const anim = animatingRings[i];

        // Determine direction: forward (j/left mouse), reverse (l/right mouse)
        let forward = keys.j || mouseDown;
        let reverse = keys.l || rightMouseDown;

        // If both are held, prioritize reverse
        let direction = 0;
        if (reverse) direction = -1;
        else if (forward) direction = 1;

        // Only update direction if not done
        if (!anim.done) {
            if (direction !== 0) {
                if (anim.paused || anim.direction !== direction) {
                    anim.lastTimestamp = now;
                }
                anim.paused = false;
                anim.direction = direction;
                // Advance or reverse animation
                let delta = now - anim.lastTimestamp;
                anim.lastTimestamp = now;
                anim.elapsed += delta * direction;
                // Clamp elapsed between 0 and ANIMATION_DURATION
                if (anim.elapsed > conveyorSpeed) anim.elapsed = conveyorSpeed;
                if (anim.elapsed < 0) anim.elapsed = 0;
            } else {
                anim.paused = true;
                anim.lastTimestamp = now;
            }
        }

        const t = Math.min(Math.max(anim.elapsed / conveyorSpeed, 0), 1);

        // --- Wall stake scoring logic with hold ---
        // If t is held, and the front of the robot is adjacent to a wall stake, start/continue hold timer
        if (!anim.done) {
            const frontOffset = ROBOT_HEIGHT / 2;
            const frontX = robot.position.x + Math.cos(robot.angle) * frontOffset;
            const frontY = robot.position.y + Math.sin(robot.angle) * frontOffset;
            const wallStake = getAdjacentWallStake(frontX, frontY);

            // Only track hold for the first animating ring (one at a time)
            if (i === animatingRings.length - 1 && keys.t && wallStake && (!wallStake.rings || wallStake.rings.length < 6)) {
                if (!anim.wallStakeHoldStart) {
                    anim.wallStakeHoldStart = now;
                }
                if (now - anim.wallStakeHoldStart >= holdTime) {
                    if (!wallStake.rings) wallStake.rings = [];
                    wallStake.rings.push(anim.color === red ? "red" : "blue");
                    animatingRings.splice(i, 1);
                    continue;
                }
            } else {
                // Reset hold timer if t is not held or not adjacent
                anim.wallStakeHoldStart = null;
            }
        }

        // Forward completion: score/eject out back
        if (!anim.done && anim.direction === 1 && t >= 1 && !anim.ejectedBack) {
            // Try to score on alliance stake if not holding a mogo and back is adjacent
            if (!attachedMogo) {
                const backOffset = -ROBOT_HEIGHT * 0.8;
                const backX = robot.position.x + Math.cos(robot.angle) * backOffset;
                const backY = robot.position.y + Math.sin(robot.angle) * backOffset;
                const stake = getAdjacentAllianceStake(backX, backY);
                if (stake && (!stake.rings || stake.rings.length < 2)) {
                    // Only allow scoring if ring color matches alliance
                    // Red alliance: x=0, Blue alliance: x=144*inches
                    const isRedStake = stake.position.x === 0;
                    const isBlueStake = stake.position.x === 144 * inches;
                    if (
                        (isRedStake && anim.color === red) ||
                        (isBlueStake && anim.color === blue)
                    ) {
                        if (!stake.rings) stake.rings = [];
                        stake.rings.push(anim.color === red ? "red" : "blue");
                        anim.done = true;
                        anim.ejectedBack = true;
                        anim.eject = null;
                        continue; // skip normal ejection
                    }
                    // If color does not match, do nothing (ring is not scored or ejected)
                    // Animation will remain until user reverses or moves away
                    continue;
                }
            }
            // Normal ejection logic
            if (attachedMogo && attachedMogo.rings && attachedMogo.rings.length < 6) {
                attachedMogo.rings.push(anim.color === red ? "red" : "blue");
                anim.done = true;
                anim.ejectedBack = true;
                anim.eject = null;
            } else {
                // Eject out the back as a new ring with hitbox, only if not too close to edge
                const backOffset = -ROBOT_HEIGHT * 0.8;
                const ejectX = robot.position.x + Math.cos(robot.angle) * backOffset;
                const ejectY = robot.position.y + Math.sin(robot.angle) * backOffset;
                if (!isPositionTooCloseToEdge(ejectX, ejectY)) {
                    const color = anim.color;
                    const outer = Bodies.circle(ejectX, ejectY, RING_OUTER_RADIUS, {
                        isSensor: false,
                        friction: 1.0,
                        frictionStatic: 1.0,
                        restitution: 0,
                        density: 0.05,
                        render: { visible: false }
                    });
                    const inner = Bodies.circle(ejectX, ejectY, RING_INNER_RADIUS, {
                        isSensor: true,
                        render: { visible: false }
                    });
                    rings.push({ outer, inner, color });
                    World.add(world, [outer, inner]);
                    anim.done = true;
                    anim.ejectedBack = true;
                    anim.eject = null;
                }
                // If too close to edge, do not eject or finish animation (wait until not at edge)
            }
        }

        // Reverse completion: eject out front
        if (!anim.done && anim.direction === -1 && t <= 0 && !anim.ejectedFront) {
            // Eject out the front as a new ring with hitbox, only if not too close to edge
            const frontOffset = ROBOT_HEIGHT / 2 + 4;
            const ejectX = robot.position.x + Math.cos(robot.angle) * frontOffset;
            const ejectY = robot.position.y + Math.sin(robot.angle) * frontOffset;
            if (!isPositionTooCloseToEdge(ejectX, ejectY)) {
                const color = anim.color;
                const outer = Bodies.circle(ejectX, ejectY, RING_OUTER_RADIUS, {
                    isSensor: false,
                    friction: 1.0,
                    frictionStatic: 1.0,
                    restitution: 0,
                    density: 0.05,
                    render: { visible: false }
                });
                const inner = Bodies.circle(ejectX, ejectY, RING_INNER_RADIUS, {
                    isSensor: true,
                    render: { visible: false }
                });
                rings.push({ outer, inner, color });
                World.add(world, [outer, inner]);
                anim.done = true;
                anim.ejectedFront = true;
                anim.eject = null;
            }
            // If too close to edge, do not eject or finish animation (wait until not at edge)
        }

        // Remove animation after 1.5s (to allow ejected ring to show briefly)
        if (anim.done && Math.abs(anim.elapsed) > holdTime) {
            animatingRings.splice(i, 1);
        }
    }
});
const triSize = 19 * inches;

Events.on(render, 'afterRender', () => {
    const ctx = render.context;

    // Draw 4 corner right angle triangles
    function drawCornerTriangle(ctx, x, y, size, color, flipX, flipY) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + size * (flipX ? -1 : 1), y);
        ctx.lineTo(x, y + size * (flipY ? -1 : 1));
        ctx.closePath();
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = color;
        ctx.fill();
        ctx.globalAlpha = 1.0;
        ctx.restore();
    }
    // Top-left
    drawCornerTriangle(ctx, 0, 0, triSize, "transparent", false, false);
    // Top-right
    drawCornerTriangle(ctx, FIELD_SIZE, 0, triSize, "transparent", true, false);
    // Bottom-left
    drawCornerTriangle(ctx, 0, FIELD_SIZE, triSize, "transparent", false, true);
    // Bottom-right
    drawCornerTriangle(ctx, FIELD_SIZE, FIELD_SIZE, triSize, "transparent", true, true);

    drawFrontTriangle(ctx, robot);

    // Draw mogos with visible ring (last in array, if any)
    mogos.forEach(mogo => {
        drawAttachedMogo(ctx, mogo);
        // Draw ring stack indicator if there are rings
        if (mogo.rings && mogo.rings.length > 0) {
            drawMogoRingStack(ctx, mogo);
            const color = mogo.rings[mogo.rings.length - 1] === "red" ? red : blue;
            drawSingleRing(ctx, { x: mogo.position.x, y: mogo.position.y }, color, mogo.angle || 0, mogo.color || MOGO_COLOR);
        }
    });

    if (attachedMogo) {
        drawAttachedMogo(ctx, attachedMogo);
        if (attachedMogo.rings && attachedMogo.rings.length > 0) {
            drawMogoRingStack(ctx, attachedMogo);
            const color = attachedMogo.rings[attachedMogo.rings.length - 1] === "red" ? red : blue;
            drawSingleRing(ctx, { x: attachedMogo.position.x, y: attachedMogo.position.y }, color, attachedMogo.angle || 0, attachedMogo.color || MOGO_COLOR);
        }
    }

    // Draw visible ring for alliance stakes (pillar at x=0 or x=144*inches, y=72) if it has rings
    pillars.forEach(pillar => {
        // Red alliance stake
        if (pillar.position.x === 0 && pillar.position.y === 72 * inches && pillar.rings && pillar.rings.length > 0) {
            const color = pillar.rings[pillar.rings.length - 1] === "red" ? red : blue;
            drawSingleRing(ctx, { x: pillar.position.x, y: pillar.position.y }, color, 0, null);
        }
        // Blue alliance stake
        if (pillar.position.x === 144 * inches && pillar.position.y === 72 * inches && pillar.rings && pillar.rings.length > 0) {
            const color = pillar.rings[pillar.rings.length - 1] === "red" ? red : blue;
            drawSingleRing(ctx, { x: pillar.position.x, y: pillar.position.y }, color, 0, null);
        }
        // Top wall stake
        if (pillar.position.x === 72 * inches && pillar.position.y === 0 && pillar.rings && pillar.rings.length > 0) {
            const color = pillar.rings[pillar.rings.length - 1] === "red" ? red : blue;
            drawSingleRing(ctx, { x: pillar.position.x, y: pillar.position.y }, color, 0, null);
        }
        // Bottom wall stake
        if (pillar.position.x === 72 * inches && pillar.position.y === 144 * inches && pillar.rings && pillar.rings.length > 0) {
            const color = pillar.rings[pillar.rings.length - 1] === "red" ? red : blue;
            drawSingleRing(ctx, { x: pillar.position.x, y: pillar.position.y }, color, 0, null);
        }
    });

    // Draw ring stack indicators for alliance and wall stakes
    pillars.forEach(pillar => {
        // Alliance stakes: x=0 or x=144*inches, y=72*inches, up to 2 rings
        // Wall stakes: y=0 or y=144*inches, x=72*inches, up to 6 rings
        let slotCount = 0;
        let side = "left"; // default
        let verticalOffset = 0; // for wall stakes
        if (
            pillar.position.x === 0 && pillar.position.y === 72 * inches
        ) {
            slotCount = 2;
            side = "right";
        } else if (
            pillar.position.x === 144 * inches && pillar.position.y === 72 * inches
        ) {
            slotCount = 2;
            side = "left";
        } else if (
            pillar.position.x === 72 * inches && pillar.position.y === 0
        ) {
            slotCount = 6;
            side = "left";
            verticalOffset = 32; // move rectangles lower for top wall stake
        } else if (
            pillar.position.x === 72 * inches && pillar.position.y === 144 * inches
        ) {
            slotCount = 6;
            side = "left";
            verticalOffset = -32; // move rectangles higher for bottom wall stake
        }
        if (slotCount > 0) {
            drawStakeRingStack(ctx, pillar, slotCount, side, verticalOffset);

            // --- Wall stake scoring hold animation ---
            // Only for the wall stake being loaded on, and always to the left of the rectangles
            if (
                (pillar.position.x === 72 * inches && (pillar.position.y === 0 || pillar.position.y === 144 * inches))
            ) {
                // Find animating ring that is waiting to score here (and only here)
                for (let i = 0; i < animatingRings.length; ++i) {
                    const anim = animatingRings[i];
                    if (
                        !anim.done &&
                        anim.wallStakeHoldStart
                    ) {
                        // Check if robot is adjacent to THIS wall stake (within 20 units)
                        const frontOffset = ROBOT_HEIGHT / 2;
                        const frontX = robot.position.x + Math.cos(robot.angle) * frontOffset;
                        const frontY = robot.position.y + Math.sin(robot.angle) * frontOffset;
                        if (
                            Math.abs(pillar.position.x - frontX) < 20 &&
                            Math.abs(pillar.position.y - frontY) < 20
                        ) {
                            // Only show for the first animating ring (the one being scored)
                            if (i === animatingRings.length - 1) {
                                // Always place the animation to the left of the rectangles
                                const slotWidth = 20;
                                const slotHeight = 8;
                                const slotSpacing = 2;
                                const radius = pillar.circleRadius || pillar.radius || (2 * inches);
                                let dx = -(radius + 38); // left of rectangles
                                let dy = ((slotCount - 1) * (slotHeight + slotSpacing)) / 2 + verticalOffset;
                                // For vertical stacking, find the slot index
                                let slotIdx = 0;
                                if (pillar.position.y === 0) {
                                    slotIdx = 0;
                                } else {
                                    slotIdx = Math.min(pillar.rings ? pillar.rings.length : 0, slotCount - 1);
                                }
                                let y;
                                if (pillar.position.y === 0) {
                                    // Top wall stake: slightly lower
                                    y = pillar.position.y + dy - (slotCount - 1 - slotIdx) * (slotHeight + slotSpacing) + 10;
                                } else {
                                    // Bottom wall stake: slightly higher
                                    y = pillar.position.y + dy - slotIdx * (slotHeight + slotSpacing) - 10;
                                }
                                let x = pillar.position.x + dx;

                                // Draw the circular progress indicator
                                const elapsed = Math.min(performance.now() - anim.wallStakeHoldStart, holdTime);
                                const pct = elapsed / holdTime;
                                const r = 10;
                                ctx.save();
                                ctx.translate(x, y);
                                // Draw faint background circle
                                ctx.globalAlpha = 0.18;
                                ctx.beginPath();
                                ctx.arc(0, 0, r, 0, 2 * Math.PI);
                                ctx.fillStyle = "#fff";
                                ctx.fill();
                                ctx.globalAlpha = 1.0;
                                // Draw rotating white arc trail (start at top)
                                const trailLen = Math.PI * 0.7;
                                for (let t = 0; t < trailLen; t += 0.15) {
                                    let a = (-Math.PI / 2) + (pct * 2 * Math.PI) - t;
                                    ctx.save();
                                    ctx.globalAlpha = 0.15 + 0.25 * (1 - t / trailLen);
                                    ctx.beginPath();
                                    ctx.arc(0, 0, r, a, a + 0.12);
                                    ctx.strokeStyle = "#fff";
                                    ctx.lineWidth = 3;
                                    ctx.stroke();
                                    ctx.restore();
                                }
                                // Draw leading dot (start at top)
                                ctx.save();
                                ctx.rotate(-Math.PI / 2 + pct * 2 * Math.PI);
                                ctx.globalAlpha = 0.8;
                                ctx.beginPath();
                                ctx.arc(r, 0, 3, 0, 2 * Math.PI);
                                ctx.fillStyle = "#fff";
                                ctx.shadowColor = "#fff";
                                ctx.shadowBlur = 6;
                                ctx.fill();
                                ctx.restore();

                                ctx.restore();
                            }
                            break;
                        }
                    }
                }
            }
        }
    });

    drawRings(ctx);

    // --- Draw a small colored dot inside field rings with .rings attribute ---
    rings.forEach(ring => {
        if (ring.outer.rings && ring.outer.rings.length > 0) {
            const baseX = ring.outer.position.x;
            const baseY = ring.outer.position.y;
            // Use the color of the bottom ring in the array
            const bottomColor = ring.outer.rings[ring.outer.rings.length - 1] === "red" ? red : blue;
            // Draw a small filled circle at the center (no hitbox, just visual)
            ctx.save();
            ctx.beginPath();
            ctx.arc(baseX, baseY, RING_INNER_RADIUS / 1.5, 0, 2 * Math.PI, false);
            ctx.fillStyle = bottomColor;
            ctx.globalAlpha = 0.95;
            ctx.fill();
            ctx.restore();
        }
    });

    // Draw animating rings and ejected rings
    const now = performance.now();
    animatingRings.forEach(anim => {
        const t = Math.min(Math.max(anim.elapsed / conveyorSpeed, 0), 1);
        if (!anim.done) {
            // Animate in robot-relative coordinates, so ring always stays inside robot
            const relX = anim.relFrom.x * (1 - t) + anim.relTo.x * t;
            const relY = anim.relFrom.y * (1 - t) + anim.relTo.y * t;
            const cos = Math.cos(robot.angle);
            const sin = Math.sin(robot.angle);
            const x = robot.position.x + relX * cos - relY * sin;
            const y = robot.position.y + relX * sin + relY * cos;
            // Use robot color for the inside of animating rings
            drawSingleRing(ctx, { x, y }, anim.color, robot.angle + (anim.relAngle || 0), robot.render.fillStyle);
        }
        // No need to draw ejected ring here, as it's added to rings[]
    });
    updateScoreboard();
});

Render.run(render);
Runner.run(Runner.create(), engine);

// --- Reset button logic ---
const resetBtn = document.getElementById('reset-btn');

// Store initial positions for reset
const INITIAL_ROBOT = { x: 50, y: 400, angle: 0 };
const INITIAL_MOGOS = [
    { x: 48, y: 48 },
    { x: 96, y: 48 },
    { x: 48, y: 96 },
    { x: 96, y: 96 },
    { x: 72, y: 121 }
];
const INITIAL_PILLAR_RINGS = [
    undefined, undefined, undefined, undefined,
    undefined, undefined, undefined, undefined
];
const INITIAL_RING_POSITIONS = RING_POSITIONS.map(r => ({
    x: r.x, y: r.y, color: r.color, rings: r.rings ? [...r.rings] : undefined
}));

function resetField() {
    // Stop timer
    timerActive = false;
    if (timerInterval) clearInterval(timerInterval);
    timeLeft = 120;
    updateTimerDisplay();
    startBtn.disabled = false;

    // Reset robot position and velocity
    Body.setPosition(robot, { x: INITIAL_ROBOT.x, y: INITIAL_ROBOT.y });
    Body.setAngle(robot, INITIAL_ROBOT.angle);
    Body.setVelocity(robot, { x: 0, y: 0 });
    Body.setAngularVelocity(robot, 0);

    // Remove all mogos from world
    mogos.forEach(mogo => World.remove(world, mogo));
    // Recreate mogos
    mogos = INITIAL_MOGOS.map(pos => {
        const body = createMogo(pos.x * inches, pos.y * inches);
        body.rings = [];
        return body;
    });
    mogos.forEach(mogo => World.add(world, mogo));

    // Remove attached mogo if any
    attachedMogo = null;

    // Remove all rings from world
    rings.forEach(ring => {
        World.remove(world, ring.outer);
        World.remove(world, ring.inner);
    });
    rings.length = 0;

    // Recreate rings
    INITIAL_RING_POSITIONS.forEach(({ x, y, color, rings: ringArr }) => {
        const outer = Bodies.circle(x * inches, y * inches, RING_OUTER_RADIUS, {
            isSensor: false,
            friction: 1.0,
            frictionStatic: 1.0,
            restitution: 0,
            density: 0.05,
            render: { visible: false }
        });
        const inner = Bodies.circle(x * inches, y * inches, RING_INNER_RADIUS, {
            isSensor: true,
            render: { visible: false }
        });
        if (ringArr && Array.isArray(ringArr)) outer.rings = [...ringArr];
        rings.push({ outer, inner, color });
        World.add(world, [outer, inner]);
    });

    // Reset pillar rings
    pillars.forEach((pillar, i) => {
        pillar.rings = INITIAL_PILLAR_RINGS[i] ? [...INITIAL_PILLAR_RINGS[i]] : [];
    });

    // Clear animating rings and add starting ring
    animatingRings.length = 0;
    animatingRings.push({
        color: red, // or blue if you want blue instead
        start: performance.now(),
        relFrom: { x: ROBOT_HEIGHT / 2, y: 0 },
        relTo: { x: -ROBOT_HEIGHT * 0.6, y: 0 },
        relAngle: 0,
        elapsed: 0.5 * 600,
        lastTimestamp: performance.now(),
        paused: true,
        direction: 0,
        ejectedFront: false,
        ejectedBack: false
    });

    // Clear keys and mouse
    Object.keys(keys).forEach(k => keys[k] = false);
    mouseDown = false;
    rightMouseDown = false;
}

if (resetBtn) resetBtn.addEventListener('click', resetField);