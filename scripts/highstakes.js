function positionBackground() {
    const gameCanvas = document.getElementById('game-canvas');
    const rect = gameCanvas.getBoundingClientRect();
    bgCanvas.style.position = 'absolute';
    bgCanvas.style.left = (rect.left - BORDER_SIZE) + 'px';
    bgCanvas.style.top = (rect.top - BORDER_SIZE) + 'px';
}

function drawBackground() {
    if (fieldImage.complete) {
        bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
        bgCtx.drawImage(fieldImage, 0, 0, bgCanvas.width, bgCanvas.height);
    } else {
    fieldImage.onload = function () {
        drawBackground();
        positionBackground();
    };
    }
}

function createMogo(x, y) {
    return Bodies.polygon(x, y, 6, MOGO_RADIUS, {
    friction: 1.0,
    frictionStatic: 1.0,
    restitution: 0,
    density: 0.5,
    angle: Math.PI / 6,
    render: {
        fillStyle: MOGO_COLOR,
        strokeStyle: '#343720',
        lineWidth: 2
    }
    });
}

// Draw shapes

const drawFrontTriangle = (ctx, body) => {
    const angle = body.angle;
    const pos = body.position;
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(angle + Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(0, -ROBOT_HEIGHT / 2 + 2);
    ctx.lineTo(-6, -ROBOT_HEIGHT / 2 + 12);
    ctx.lineTo(6, -ROBOT_HEIGHT / 2 + 12);
    ctx.closePath();
    ctx.fillStyle = 'white';
    ctx.fill();
    ctx.restore();
};

const drawAttachedMogo = (ctx, hex) => {
    ctx.save();
    ctx.translate(hex.position.x, hex.position.y);
    ctx.rotate(hex.angle);
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
    const angle = i * Math.PI / 3;
    const x = Math.cos(angle) * hex.radius;
    const y = Math.sin(angle) * hex.radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = hex.color;
    ctx.fill();
    ctx.strokeStyle = '#343720';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
};

const drawRings = (ctx) => {
    rings.forEach(({ outer, color }) => {
        const x = outer.position.x;
        const y = outer.position.y;
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, RING_OUTER_RADIUS, 0, 2 * Math.PI, false);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.arc(x, y, RING_INNER_RADIUS, 0, 2 * Math.PI, false);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        
        if (color == red) {
            ctx.strokeStyle = '#350f0f';
        } else {
            ctx.strokeStyle = '#0f1d35';
        }

        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, RING_OUTER_RADIUS, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, RING_INNER_RADIUS, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.restore();
    });
};