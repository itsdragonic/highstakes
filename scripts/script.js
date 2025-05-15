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
const robot = Bodies.rectangle(5, FIELD_SIZE / 2, ROBOT_HEIGHT, ROBOT_WIDTH, {
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
    {x: 0, y: 72, radius: 2 * inches},
    {x: 144, y: 72, radius: 2 * inches},
    {x: 72, y: 0, radius: 2 * inches},
    {x: 72, y: 144, radius: 2 * inches}
];

const pillars = pillarPositions.map(pos =>
    Bodies.circle(
        pos.x * inches,
        pos.y * inches,
        pos.radius,
        {
            isStatic: true,
            render: { fillStyle: 'transparent', visible: true }
        }
    )
);

// Create Mobile Goals (mogos)
// Add a 'rings' array to each mogo, max 6, e.g. ["red", "blue"]
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
    if (i === 0) body.rings.push("blue");
    return body;
});

// Create Rings
const red = '#bc232c';
const blue = '#286fb5';

const RING_OUTER_RADIUS = 7 / 2 * inches;
const RING_INNER_RADIUS = RING_OUTER_RADIUS - (2 * inches);
const RING_POSITIONS = [
    { x: 121, y: 121, color: red },
    { x: 132, y: 73, color: red },
    { x: 23, y: 121, color: blue },
    { x: 12, y: 73, color: blue },

    { x: 69, y: 70, color: blue },
    { x: 69, y: 76, color: blue },
    { x: 76, y: 70, color: red },
    { x: 76, y: 76, color: red },
];

const rings = RING_POSITIONS.map(({ x, y, color }) => {
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
    return { outer, inner, color };
});

rings.forEach(ring => {
    World.add(world, [ring.outer, ring.inner]);
});

World.add(world, [robot, ...boundaries, ...pillars, ...mogos]);

const keys = { w: false, a: false, s: false, d: false, r: false, j: false };
let mouseDown = false;

document.addEventListener('keydown', e => { if (e.key in keys) keys[e.key] = true; });
document.addEventListener('keyup', e => { if (e.key in keys) keys[e.key] = false; });
document.addEventListener('mousedown', e => { if (e.button === 0) mouseDown = true; });
document.addEventListener('mouseup', e => { if (e.button === 0) mouseDown = false; });

const forceMagnitude = 0.0075;
const turnSpeed = 0.04;
let attachedMogo = null;
let lastRState = false;

// Animation state for grabbed rings
// Now also track if the animation has been "scored" or "ejected"
let animatingRings = []; // {color, start, relFrom, relTo, relAngle, done}

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

    // Ring grabbing: remove ring if in front and input is held
    if (keys.j || mouseDown) {
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
                World.remove(world, ring.outer);
                World.remove(world, ring.inner);
                // Animation: store RELATIVE positions, but relFrom should be (frontOffset, 0) in robot's local frame
                animatingRings.push({
                    color: ring.color,
                    start: performance.now(),
                    relFrom: { x: frontOffset, y: 0 },
                    relTo: { x: backOffset, y: 0 },
                    relAngle: 0
                });
                rings.splice(i, 1);
                break;
            }
        }
    }

    // Remove finished animations (after 1 second) and handle scoring/ejection
    const now = performance.now();
    for (let i = animatingRings.length - 1; i >= 0; --i) {
        const anim = animatingRings[i];
        const t = Math.min((now - anim.start) / 1000, 1);
        if (!anim.done && t >= 1) {
            // Animation finished, handle scoring or ejection
            if (attachedMogo && attachedMogo.rings && attachedMogo.rings.length < 6) {
                // Score on attached mogo
                attachedMogo.rings.push(anim.color === red ? "red" : "blue");
            } else {
                // Eject out the back as a new ring with hitbox
                const backOffset = -ROBOT_HEIGHT * 0.8;
                const ejectX = robot.position.x + Math.cos(robot.angle) * backOffset;
                const ejectY = robot.position.y + Math.sin(robot.angle) * backOffset;
                // Create a new ring body at the ejection position
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
            }
            anim.done = true;
        }
        // Remove animation after 1.5s (to allow ejected ring to show briefly)
        if (now - anim.start > 1500) {
            animatingRings.splice(i, 1);
        }
    }
});


Events.on(render, 'afterRender', () => {
    const ctx = render.context;

    // Draw 4 translucent corner right angle triangles
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
    const triSize = 12 * inches;
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

    drawRings(ctx);

    // Draw animating rings and ejected rings
    const now = performance.now();
    animatingRings.forEach(anim => {
        const t = Math.min((now - anim.start) / 1000, 1);
        if (!anim.done) {
            // Animate in robot-relative coordinates, so ring always stays inside robot
            const relX = anim.relFrom.x * (1 - t) + anim.relTo.x * t;
            const relY = anim.relFrom.y * (1 - t) + anim.relTo.y * t;
            const cos = Math.cos(robot.angle);
            const sin = Math.sin(robot.angle);
            const x = robot.position.x + relX * cos - relY * sin;
            const y = robot.position.y + relX * sin + relY * cos;
            drawSingleRing(ctx, { x, y }, anim.color, robot.angle + (anim.relAngle || 0));
        } else if (anim.eject && now - anim.start < 1500) {
            // Draw ejected ring for a brief moment
            drawSingleRing(ctx, { x: anim.eject.x, y: anim.eject.y }, anim.eject.color, anim.eject.angle);
        }
    });
    updateScoreboard();
});

Render.run(render);
Runner.run(Runner.create(), engine);

// Helper to draw a single ring at a position and angle
// Add optional 'innerColor' parameter for the ring's inside
function drawSingleRing(ctx, pos, color, angle = 0, innerColor = null) {
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.arc(0, 0, RING_OUTER_RADIUS, 0, 2 * Math.PI, false);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(0, 0, RING_INNER_RADIUS, 0, 2 * Math.PI, false);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    // Draw inner color if provided (for rings on mogos)
    if (innerColor) {
        ctx.beginPath();
        ctx.arc(0, 0, RING_INNER_RADIUS, 0, 2 * Math.PI, false);
        ctx.fillStyle = innerColor;
        ctx.fill();
    }
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = (color == red) ? '#350f0f' : '#0f1d35';
    ctx.beginPath();
    ctx.arc(0, 0, RING_OUTER_RADIUS, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, RING_INNER_RADIUS, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.restore();
}

// Utility: check if a point is in a right triangle at a corner
function pointInCornerTriangle(px, py, corner) {
    const triSize = 12 * inches;
    if (corner === "top-left") {
        return px >= 0 && px <= triSize && py >= 0 && py <= triSize && (px + py <= triSize);
    } else if (corner === "top-right") {
        return px <= FIELD_SIZE && px >= FIELD_SIZE - triSize && py >= 0 && py <= triSize && (FIELD_SIZE - px + py <= triSize);
    } else if (corner === "bottom-left") {
        return px >= 0 && px <= triSize && py <= FIELD_SIZE && py >= FIELD_SIZE - triSize && (px + FIELD_SIZE - py <= triSize);
    } else if (corner === "bottom-right") {
        return px <= FIELD_SIZE && px >= FIELD_SIZE - triSize && py <= FIELD_SIZE && py >= FIELD_SIZE - triSize && (FIELD_SIZE - px + FIELD_SIZE - py <= triSize);
    }
    return false;
}

// Scoreboard logic
function updateScoreboard() {
    let red = 0, blue = 0;

    function scoreMogoRings(rings, multiplier) {
        if (!rings || rings.length === 0) return { red: 0, blue: 0 };
        let r = 0, b = 0;
        for (let i = 0; i < rings.length - 1; ++i) {
            if (rings[i] === "red") r += 1 * multiplier;
            else if (rings[i] === "blue") b += 1 * multiplier;
        }
        // Top ring (last in array) is worth 3 * multiplier * 2 if doubled
        if (rings.length > 0) {
            if (rings[rings.length - 1] === "red") r += 3 * multiplier;
            else if (rings[rings.length - 1] === "blue") b += 3 * multiplier;
        }
        return { red: r, blue: b };
    }

    function getCornerMultiplier(x, y) {
        if (pointInCornerTriangle(x, y, "bottom-left") || pointInCornerTriangle(x, y, "bottom-right")) {
            return 2; // double points
        }
        if (pointInCornerTriangle(x, y, "top-left") || pointInCornerTriangle(x, y, "top-right")) {
            return -2; // double negative points
        }
        return 1;
    }

    mogos.forEach(mogo => {
        const mx = mogo.position.x;
        const my = mogo.position.y;
        const mult = getCornerMultiplier(mx, my);
        const s = scoreMogoRings(mogo.rings, mult);
        red += s.red;
        blue += s.blue;
    });

    if (attachedMogo) {
        const mx = attachedMogo.position.x;
        const my = attachedMogo.position.y;
        const mult = getCornerMultiplier(mx, my);
        const s = scoreMogoRings(attachedMogo.rings, mult);
        red += s.red;
        blue += s.blue;
    }

    // Clamp to zero (no negative scores)
    red = Math.max(0, red);
    blue = Math.max(0, blue);

    const redElem = document.getElementById('red-score');
    const blueElem = document.getElementById('blue-score');
    if (redElem) redElem.textContent = red;
    if (blueElem) blueElem.textContent = blue;
}

// Draws the ring stack indicator for a mogo (6 slots, filled from bottom up)
// Always vertical, not rotated, wider and less tall, fills from bottom up
function drawMogoRingStack(ctx, mogo) {
    const slotCount = 6;
    const slotWidth = 20;
    const slotHeight = 8;
    const slotSpacing = 2;
    const radius = mogo.radius || MOGO_RADIUS;
    // Position to the left of the mogo (relative to field, not angle)
    const offset = radius + 14;
    const baseX = mogo.position.x - offset;
    const baseY = mogo.position.y + ((slotCount - 1) * (slotHeight + slotSpacing)) / 2;

    for (let i = 0; i < slotCount; ++i) {
        const x = baseX;
        const y = baseY - i * (slotHeight + slotSpacing);

        ctx.save();
        ctx.translate(x, y);

        // Draw rounded rectangle (dark gray or colored if filled)
        ctx.beginPath();
        const r = 4;
        ctx.moveTo(-slotWidth / 2 + r, -slotHeight / 2);
        ctx.lineTo(slotWidth / 2 - r, -slotHeight / 2);
        ctx.quadraticCurveTo(slotWidth / 2, -slotHeight / 2, slotWidth / 2, -slotHeight / 2 + r);
        ctx.lineTo(slotWidth / 2, slotHeight / 2 - r);
        ctx.quadraticCurveTo(slotWidth / 2, slotHeight / 2, slotWidth / 2 - r, slotHeight / 2);
        ctx.lineTo(-slotWidth / 2 + r, slotHeight / 2);
        ctx.quadraticCurveTo(-slotWidth / 2, slotHeight / 2, -slotWidth / 2, slotHeight / 2 - r);
        ctx.lineTo(-slotWidth / 2, -slotHeight / 2 + r);
        ctx.quadraticCurveTo(-slotWidth / 2, -slotHeight / 2, -slotWidth / 2 + r, -slotHeight / 2);
        ctx.closePath();

        // Fill with color if this slot is filled (bottom-up), else dark gray
        const ringIdx = i;
        if (mogo.rings && ringIdx < mogo.rings.length) {
            ctx.globalAlpha = 0.65;
            ctx.fillStyle = mogo.rings[ringIdx] === "red" ? red : blue;
        } else {
            ctx.globalAlpha = 0.85;
            ctx.fillStyle = "#222";
        }
        ctx.fill();
        ctx.globalAlpha = 1.0;

        ctx.restore();
    }
}