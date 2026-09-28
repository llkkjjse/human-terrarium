import Phaser from 'phaser';
import { buildMapModel, type BuildingModel } from './mapModel';
import type { WorldState } from '../sim/types';

interface ResidentView {
  container: Phaser.GameObjects.Container;
  ring: Phaser.GameObjects.Arc;
  activity: Phaser.GameObjects.Text;
}

function drawBuilding(scene: Phaser.Scene, building: BuildingModel): void {
  const graphics = scene.add.graphics();
  const palettes: Record<BuildingModel['kind'], [number, number]> = {
    home: [0xe3c7a5, 0x9f7657], shop: [0xd5a86f, 0x8d5f47], office: [0x9bb1bd, 0x58717e], clinic: [0xd8e5df, 0x71958a],
    pavilion: [0xc9a66b, 0x6d5841], tree: [0x7fa579, 0x42654b], utility: [0xa89e8f, 0x625c55], warehouse: [0xb1a18d, 0x675c50],
  };
  const [fill, edge] = palettes[building.kind];
  if (building.kind === 'tree') {
    graphics.fillStyle(0x4f714f, 0.32).fillEllipse(building.x + 4, building.y + 26, 70, 22);
    graphics.fillStyle(0x765b43).fillRect(building.x - 6, building.y, 12, 36);
    graphics.fillStyle(fill).fillCircle(building.x, building.y - 10, 28);
    graphics.fillStyle(0x9bbb82).fillCircle(building.x - 14, building.y - 18, 15);
    return;
  }
  const left = building.x - building.width / 2;
  const top = building.y - building.height / 2;
  graphics.fillStyle(0x4a3f38, 0.18).fillRoundedRect(left + 8, top + 10, building.width, building.height, 5);
  graphics.fillStyle(edge).fillTriangle(left - 8, top + 12, building.x, top - 30, left + building.width + 8, top + 12);
  graphics.fillStyle(fill).fillRoundedRect(left, top, building.width, building.height, 4);
  graphics.lineStyle(3, edge, 0.55).strokeRoundedRect(left, top, building.width, building.height, 4);
  const windowColor = building.kind === 'clinic' ? 0xeaf7f2 : 0xf7df9a;
  for (let col = 0; col < 3; col += 1) graphics.fillStyle(windowColor, 0.85).fillRect(left + 16 + col * 38, top + 20, 21, 24);
  graphics.fillStyle(edge).fillRect(building.x - 13, top + building.height - 35, 26, 35);
  if (building.kind === 'clinic') {
    graphics.fillStyle(0xcf6b61).fillRect(building.x - 4, top - 4, 8, 26).fillRect(building.x - 13, top + 5, 26, 8);
  }
}

function createResident(scene: Phaser.Scene, resident: WorldState['residents'][number], onSelect: (id: string) => void): ResidentView {
  const container = scene.add.container(resident.x, resident.y).setDepth(20).setSize(28, 44).setInteractive({ useHandCursor: true });
  const shadow = scene.add.ellipse(2, 18, 30, 10, 0x2e332e, 0.18);
  const ring = scene.add.circle(0, 0, 24).setStrokeStyle(3, 0xe9c46a, 0).setFillStyle(0xffffff, 0);
  const body = scene.add.rectangle(0, 7, 20, 25, Phaser.Display.Color.HexStringToColor(resident.color).color).setStrokeStyle(2, 0x4f4944, 0.5);
  const head = scene.add.circle(0, -12, 10, 0xf0c8a8).setStrokeStyle(2, 0x604c41, 0.45);
  const hair = scene.add.arc(0, -15, 9, 190, 350, false, 0x51433e);
  const activity = scene.add.text(0, -39, '', { fontFamily: 'Microsoft YaHei, sans-serif', fontSize: '13px', color: '#3f443e', backgroundColor: '#f8f3e8dd', padding: { x: 5, y: 3 } }).setOrigin(0.5);
  container.add([shadow, ring, body, head, hair, activity]);
  container.on('pointerdown', (pointer: Phaser.Input.Pointer) => { pointer.event.stopPropagation(); onSelect(resident.id); });
  return { container, ring, activity };
}

const activityLabels: Record<WorldState['residents'][number]['activity'], string> = {
  idle: '…', sleep: '睡', eat: '食', work: '职', socialize: '聊', relax: '闲', 'seek-care': '医', commute: '行',
};

export function createTerrariumGame(container: HTMLElement, initialWorld: WorldState, onSelect: (id: string) => void) {
  let world = initialWorld;
  let selectedId: string | null = null;
  let residentViews = new Map<string, ResidentView>();

  class TerrariumScene extends Phaser.Scene {
    constructor() { super('terrarium'); }

    create() {
      const model = buildMapModel(world);
      this.cameras.main.setBounds(-80, -80, 1600, 1120).setZoom(0.78).centerOn(720, 480);
      this.add.rectangle(720, 480, 1540, 1060, 0xf4efe4).setStrokeStyle(2, 0x655c53, 0.24);
      model.districts.forEach((district) => {
        this.add.rectangle(district.x + district.width / 2, district.y + district.height / 2, district.width - 14, district.height - 14, district.color, 0.42).setStrokeStyle(2, district.color, 0.8);
        this.add.text(district.x + 30, district.y + 28, district.name, { fontFamily: 'Microsoft YaHei, sans-serif', fontSize: '24px', color: '#443f39', fontStyle: 'bold' }).setDepth(5);
        this.add.text(district.x + 31, district.y + 59, district.description, { fontFamily: 'Microsoft YaHei, sans-serif', fontSize: '13px', color: '#5f5a53' }).setDepth(5);
      });
      const roads = this.add.graphics().setDepth(3);
      roads.fillStyle(0xe8dfcf).fillRect(690, 0, 60, 960).fillRect(0, 450, 1440, 60);
      roads.lineStyle(2, 0xc8baa5, 0.75).lineBetween(720, 0, 720, 960).lineBetween(0, 480, 1440, 480);
      model.buildings.forEach((building) => drawBuilding(this, building));
      residentViews = new Map(world.residents.map((resident) => [resident.id, createResident(this, resident, onSelect)]));

      let dragging = false;
      let lastX = 0;
      let lastY = 0;
      this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => { dragging = true; lastX = pointer.x; lastY = pointer.y; });
      this.input.on('pointerup', () => { dragging = false; });
      this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
        if (!dragging) return;
        this.cameras.main.scrollX -= (pointer.x - lastX) / this.cameras.main.zoom;
        this.cameras.main.scrollY -= (pointer.y - lastY) / this.cameras.main.zoom;
        lastX = pointer.x; lastY = pointer.y;
      });
      this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _objects: unknown, _dx: number, dy: number) => {
        this.cameras.main.setZoom(Phaser.Math.Clamp(this.cameras.main.zoom - dy * 0.0007, 0.48, 1.35));
      });
      this.events.on('world-update', () => this.syncResidents());
      this.syncResidents();
    }

    syncResidents() {
      for (const resident of world.residents) {
        let view = residentViews.get(resident.id);
        if (!view) {
          view = createResident(this, resident, onSelect);
          residentViews.set(resident.id, view);
        }
        this.tweens.add({ targets: view.container, x: resident.x, y: resident.y, duration: 900, ease: 'Sine.easeInOut' });
        view.activity.setText(activityLabels[resident.activity]);
        view.activity.setVisible(resident.activity === 'socialize' || resident.activity === 'eat' || resident.activity === 'seek-care');
        view.ring.setStrokeStyle(3, 0xe9c46a, selectedId === resident.id ? 1 : 0);
        view.container.setAlpha(resident.alive ? 1 : 0.25);
      }
    }
  }

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: container,
    width: 900,
    height: 610,
    backgroundColor: '#eee7da',
    pixelArt: true,
    antialias: false,
    scene: TerrariumScene,
    scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
    render: { transparent: false, roundPixels: true },
  });

  return {
    update(nextWorld: WorldState, nextSelectedId: string | null) {
      world = nextWorld;
      selectedId = nextSelectedId;
      const scene = game.scene.getScene('terrarium');
      if (scene?.scene.isActive()) scene.events.emit('world-update');
    },
    destroy() { game.destroy(true); },
  };
}
