import { div, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { settings, shared, layout } from "herdr";

const SPRITE_DIR = "mods/star-wars-agents/sprites/star-wars";
const WEAPON_DIR = `${SPRITE_DIR}/weapons`;
export const SPRITE_SIZE = 36;
const WEAPONS = {
  vader: "saber-red", luke: "saber-green", "obi-wan": "saber-blue", yoda: "saber-green",
  ahsoka: "saber-blue", "mace-windu": "saber-blue", leia: "blaster", han: "blaster",
  chewbacca: "bowcaster", stormtrooper: "blaster", r2d2: "droid-zap",
};
const EASTER_EGGS = [
  { pair: ["vader", "luke"], speaker: "vader", line: "I am your father." },
  { pair: ["luke", "yoda"], speaker: "yoda", line: "Do. Or do not. There is no try." },
  { pair: ["han", "chewbacca"], speaker: "han", line: "Chewie, we're home." },
  { pair: ["leia", "r2d2"], speaker: "leia", line: "Help me, Obi-Wan Kenobi." },
];

export function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

export function heroSprite(hero, status, t) {
  const sprite = image(`${SPRITE_DIR}/${hero}.svg`).w(SPRITE_SIZE).h(SPRITE_SIZE).flex_none();
  if (status !== "blocked" && status !== "done") return sprite;

  const blocked = status === "blocked";
  const color = blocked ? t.blocked : t.done;
  return div().relative().w(SPRITE_SIZE).h(SPRITE_SIZE).flex_none().child(sprite)
    .child(div().absolute().left(0).top(0).size(13).rounded(4)
      .bg(t.popover).border(1).border_color(color)
      .flex().items_center().justify_center().text_size(10).font_bold()
      .text_color(color).child(blocked ? "!" : "✦"));
}

function speechTail(id, center, t) {
  const tail = div().id(id).absolute().left(center - 4).top(0).w(8).h(8);
  for (const [x, y, width, height, color] of [
    [3, 0, 2, 2, t.border], [2, 2, 4, 2, t.border], [1, 4, 6, 2, t.border], [0, 6, 8, 2, t.border],
    [3, 2, 2, 2, t.popover], [2, 4, 4, 2, t.popover], [1, 6, 6, 2, t.popover],
  ]) tail.child(div().absolute().left(x).top(y).w(width).h(height).bg(color));
  return tail;
}

export function battleScene(space, members, cast, t) {
  const fighters = members.slice(0, 4);
  const present = new Set(fighters.map(agent => cast[agent.address]));
  const easterEgg = EASTER_EGGS.find(({ pair }) => pair.every(hero => present.has(hero)));
  const speakerIndex = fighters.findIndex(agent => cast[agent.address] === easterEgg?.speaker);
  // The centered sprite row uses 34px bodies, 10px clashes and 1px gaps.
  const speakerOffset = speakerIndex < 0 ? 0 : 46 * speakerIndex - 23 * (fighters.length - 1);
  const ship = shared("star-wars.ships")?.[space];
  const sidebarWidth = find(layout(), "sidebar")?.size?.px ?? 268;
  const backdropHeight = sidebarWidth * 9 / 16;
  const tailLimit = Math.max(0, sidebarWidth / 2 - 32);
  const tailOffset = Math.max(-tailLimit, Math.min(tailLimit, speakerOffset));

  return div().id(`fight-${space}`).relative().flex().flex_col().overflow_hidden()
    .h(easterEgg ? 80 : 42).mx(5).my(2).flex_none().rounded(6).bg(t.raised)
    .border(1).border_color(t.border)
    .when(Boolean(ship), el => el.child(image(`backgrounds/ships/${settings().dark === false ? "light-side" : "dark-side"}/${ship}.png`)
      .absolute().left(0).top((42 - backdropHeight) / 2).w_full().h(backdropHeight).opacity(0.35)))
    .child(h_flex().id(`fight-field-${space}`).relative().h(40).px(6).flex_none()
      .items_center().justify_center().gap(1)
    .children(fighters.flatMap((agent, index) => {
      const hero = cast[agent.address];
      const facing = index % 2 ? "left" : "right";
      const weapon = WEAPONS[hero] ?? "blaster";
      const weaponPath = weapon === "droid-zap" ? `${WEAPON_DIR}/${weapon}.svg` : `${WEAPON_DIR}/${weapon}-${facing}.svg`;
      const sprite = div().id(`fight-${agent.address}`).relative().w(34).h(36).flex_none()
        .loop("left", { from: index % 2 ? 1 : -1, to: index % 2 ? -1 : 1, period: 760 })
        .child(image(`${SPRITE_DIR}/${hero}.svg`).w(32).h(32))
        .child(image(weaponPath).w(22).h(12).absolute().top(16).left(index % 2 ? -5 : 17));
      const clash = div().size(10).flex_none().flex().items_center().justify_center()
        .text_size(10).font_bold().text_color(t.working)
        .loop("opacity", { from: 0.35, to: 1, period: 360 }).child("✦");
      return index < fighters.length - 1 ? [sprite, clash] : [sprite];
    }))
    .when(members.length > fighters.length, el => el.child(div().flex_none().text_size(10)
      .font_semibold().text_color(t.dim).child(`+${members.length - fighters.length}`))))
    .when(Boolean(easterEgg), el => el.child(div().id(`fight-comms-${space}`).relative().mx(6).mb(4).h(34).flex_none()
      .overflow_hidden().tooltip(easterEgg.line).accessibility_label(`${easterEgg.speaker} says: ${easterEgg.line}`)
      .child(div().id(`fight-bubble-${space}`).absolute().left(0).right(0).top(6).h(28).px(7)
        .rounded(8).border(1).border_color(t.border).bg(t.popover).flex().items_center().justify_center()
        .child(div().min_w(0).truncate().text_size(9).font_semibold().text_color(t.foreground).child(easterEgg.line)))
      .child(div().absolute().left("50%").top(0)
        .child(speechTail(`fight-tail-${space}`, tailOffset, t)))));
}
