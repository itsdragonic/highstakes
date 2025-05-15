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
const robot = Bodies.rectangle(FIELD_SIZE / 2, FIELD_SIZE / 2, ROBOT_HEIGHT, ROBOT_WIDTH, {
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
const MOGO_RADIUS = 6 * inches;
const MOGO_COLOR = '#bcc927';
const mogoPositions = [
    { x: 48, y: 48 },
    { x: 96, y: 48 },
    { x: 48, y: 96 },
    { x: 96, y: 96 },
    { x: 72, y: 121 },
];

let mogos = mogoPositions.map(pos => createMogo(pos.x * inches, pos.y * inches));

// Create Rings
const red = '#bc232c';
const blue = '#286fb5';

const RING_OUTER_RADIUS = 7 / 2 * inches;
const RING_INNER_RADIUS = RING_OUTER_RADIUS - (2 * inches);
const RING_POSITIONS = [
    { x: 121, y: 121, color: red },
    { x: 132, y: 73, color: red },
    { x: 23, y: 121, color: blue },
    { x: 12, y: 73, color: blue }
];

const rings = RING_POSITIONS.map(({ x, y, color }) => {
    const outer = Bodies.circle(x * inches, y * inches, RING_OUTER_RADIUS, {
        isSensor: false,
        friction: 1.0,
        frictionStatic: 1.0,
        restitution: 0,
        density: 0.1,
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

const keys = { w: false, a: false, s: false, d: false, r: false };
const forceMagnitude = 0.0075;
const turnSpeed = 0.04;
let attachedMogo = null;
let lastRState = false;

document.addEventListener('keydown', e => { if (e.key in keys) keys[e.key] = true; });
document.addEventListener('keyup', e => { if (e.key in keys) keys[e.key] = false; });

Events.on(engine, 'beforeUpdate', () => {
    if (keys.r !== lastRState) {
        if (keys.r) {
            if (!attachedMogo) {
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
                attachedMogo = {
                    position: { x: backPosition.x, y: backPosition.y },
                    angle: robot.angle,
                    radius: MOGO_RADIUS,
                    color: MOGO_COLOR
                };
            }
            } else {
                const releasePosition = {
                    x: robot.position.x - Math.cos(robot.angle) * ROBOT_HEIGHT,
                    y: robot.position.y - Math.sin(robot.angle) * ROBOT_HEIGHT
                };
                const newMogo = createMogo(releasePosition.x, releasePosition.y);
                mogos.push(newMogo);
                World.add(world, newMogo);
                attachedMogo = null;
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
});


Events.on(render, 'afterRender', () => {
    const ctx = render.context;
    drawFrontTriangle(ctx, robot);
    if (attachedMogo) drawAttachedMogo(ctx, attachedMogo);
    drawRings(ctx);
});

Render.run(render);
Runner.run(Runner.create(), engine);