export interface Point { x: number; y: number }
export interface RoamBounds { width: number; height: number }
/** Time-based waypoint motion, separate from sprite animation and editor rendering. */
export class Roaming {
    position: Point = { x: 40, y: 0 };
    target?: Point;
    direction = 1;
    private velocity: Point = { x: 1, y: .4 };
    constructor(private random: () => number = Math.random) {}
    constrain(bounds: RoamBounds) {
        this.position.x = Math.max(0, Math.min(bounds.width, this.position.x));
        this.position.y = Math.max(0, Math.min(bounds.height, this.position.y));
        if (this.target && (this.target.x > bounds.width || this.target.y > bounds.height)) this.target = undefined;
    }
    choose(bounds: RoamBounds, first = false) {
        this.constrain(bounds);
        let candidate = { x: bounds.width * .7, y: bounds.height * .6 };
        if (!first) for (let attempt = 0; attempt < 8; attempt++) {
            candidate = { x: this.random() * bounds.width, y: this.random() * bounds.height };
            if (Math.hypot(candidate.x - this.position.x, candidate.y - this.position.y) >= Math.hypot(bounds.width, bounds.height) * .3) break;
        }
        this.target = candidate;
    }
    relocate(bounds: RoamBounds) { this.choose(bounds); this.position = { ...this.target! }; this.target = undefined; }
    step(seconds: number, speed: number, bounds: RoamBounds) {
        this.constrain(bounds);
        if (!this.target) this.choose(bounds, true);
        const dx = this.target!.x - this.position.x, dy = this.target!.y - this.position.y;
        const distance = Math.hypot(dx, dy), travel = Math.max(0, speed) * seconds;
        if (distance <= travel || distance < 1) {
            this.position = { ...this.target! }; this.choose(bounds); return;
        }
        // Smooth turns instead of bouncing at a fixed diagonal on every edge.
        const blend = Math.min(1, seconds * 5);
        this.velocity.x += (dx / distance - this.velocity.x) * blend;
        this.velocity.y += (dy / distance - this.velocity.y) * blend;
        const length = Math.hypot(this.velocity.x, this.velocity.y) || 1;
        this.position.x += this.velocity.x / length * travel;
        this.position.y += this.velocity.y / length * travel;
        if (Math.abs(this.velocity.x) > .05) this.direction = this.velocity.x >= 0 ? 1 : -1;
        this.constrain(bounds);
    }
}
