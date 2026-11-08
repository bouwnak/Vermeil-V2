// shopdata.js - the walk-in shops in every town: what each is called, who keeps it, who's always in there, and what's on the menu.
// Just lists, so they're easy to change. shops.js builds them, towns.js finds them a lot on a street near the square,
// data.js turns each one into a counter you can trade at.
//
// kind:     tavern (a bar: drinks, folk drinking), florist (house plants, seeds, garden plants), bakery (pastries), teahouse (tea, cocoa, soup)
// keeper:   stands behind the counter; talk to them to trade
// regulars: named folk who are always in, each with their own lines. A shop may also have a quiet extra or two (`extras`) for a fuller room
// menu:     [name, icon, price, energy it gives back, what you think of it]. Had there and then
// sells:    [item, price]: things to take away (they go in your bag)

/** the town names planTown sees, and the ids everything else uses */
export const TOWN_IDS = { Willowmere: "willowmere", Sunback: "dune", Hoarshell: "frost", Mirewalk: "mire", Coralcrest: "palm", Emberback: "ember" };

export const SHOP_KINDS = {
  tavern: { label: "Tavern", eat: "Drink here", buys: "fruit for the drinks" },
  florist: { label: "Plant shop", eat: "", buys: "crops" },
  bakery: { label: "Bakery", eat: "Eat here", buys: "flour, eggs and milk" },
  teahouse: { label: "Tea house", eat: "Have it here", buys: "herbs" },
};

export const TOWN_SHOPS = {
  willowmere: [
    { kind: "tavern", title: "The Shell & Barrel",
      keeper: { name: "Hollis", role: "Landlord of the Shell & Barrel", talk: ["Pull up a stool. First sip's the best one.", "Berry Cider's my own recipe. Don't ask what's in it, I'll only lie.", "Busiest night's after market day. Everyone's got shells to spend."] },
      regulars: [
        { name: "Old Tam", role: "Retired ferryman", talk: ["Forty years I rowed that strait. Now the turtles carry everyone. Hmph.", "Buy an old man a cider? No? Worth a try.", "The bridge used to creak something awful. Still does, if you listen."] },
        { name: "Juniper", role: "Wandering minstrel", talk: ["I'm writing a song about a farmer who tamed a dinosaur. Know anyone?", "Every turtle hums, you know. Willowmere's in a nice warm key.", "La la la... sorry, practising."] },
      ], extras: 1,
      menu: [["Shell Ale", "🍺", 25, 40, "Cold and foamy. Lovely."], ["Berry Cider", "🍹", 35, 60, "Sweet, with a kick at the end!"], ["Sunset Punch", "🍸", 60, 100, "You feel ready for anything."]],
      sells: [["juice", 90]] },
    { kind: "florist", title: "Petal & Pot",
      keeper: { name: "Daisy", role: "Florist of Willowmere", talk: ["Mind the monstera, she's moody today.", "Every plant here was grown from a cutting. Like a big leafy family.", "Fruit saplings are rare this side of the sea. I get a few in now and then."] },
      regulars: [{ name: "Perrin", role: "Keen gardener", talk: ["I've come in for one fern. That was an hour ago.", "Talk to your plants. Mine never answer, but they look happier."] }],
      sells: [["fertilizer", 16]], seeds: "all", rare: true, plants: true },
    { kind: "bakery", title: "Warm Crust Bakery",
      keeper: { name: "Bun", role: "Baker of Willowmere", talk: ["Up at four every morning. Worth it for the smell.", "Cinnamon rolls come out of the oven at nine. Be quick.", "Bring me good flour and I'll pay you well for it."] },
      regulars: [{ name: "Clementine", role: "Sweet tooth", talk: ["I said just one pastry. This is my third.", "The strawberry cake is the best thing on this turtle. Fight me."] }],
      menu: [["Croissant", "🥐", 15, 25, "Flaky and buttery."], ["Cinnamon Roll", "🍥", 22, 40, "Still warm!"], ["Slice of Cake", "🍰", 40, 70, "Pure happiness."]],
      sells: [["bread", 130]] },
  ],
  dune: [
    { kind: "tavern", title: "The Dry Gulch Cantina",
      keeper: { name: "Rosa", role: "Owner of the Dry Gulch", talk: ["Out of the sun, stranger. You look half-baked.", "Cactus Fizz. It fizzes, it's made of cactus, it's perfect.", "No brawls in my cantina. The sand gets everywhere."] },
      regulars: [
        { name: "Dusty Pete", role: "Prospector", talk: ["There's gold under this turtle, I swear it. Somewhere.", "Sunstone, they call it. Glows like a little sun. Never found one myself."] },
        { name: "Marisol", role: "Caravan driver", talk: ["Three days across the dunes and I'm still finding sand in my boots.", "Take water everywhere. Then take more."] },
      ], extras: 1,
      menu: [["Cactus Fizz", "🌵", 25, 40, "Prickly and refreshing!"], ["Prickly Pear Juice", "🍹", 35, 60, "Bright pink and so sweet."], ["Desert Sunrise", "🍸", 60, 100, "You could cross the whole desert now."]],
      sells: [["juice", 95]] },
    { kind: "bakery", title: "Sunbaked Ovens",
      keeper: { name: "Amir", role: "Baker of Sunback", talk: ["The sun does half my baking. I just turn the loaves.", "Flatbread, honey cake, date rolls. Take your pick.", "Eggs are hard to come by out here. I'll pay well for them."] },
      regulars: [{ name: "Zeb", role: "Caravan cook", talk: ["I buy a hundred loaves a week for the caravans. Amir loves me.", "Honey cake keeps for days in the desert. Handy."] }],
      menu: [["Date Roll", "🥐", 15, 25, "Sticky and sweet."], ["Honey Cake", "🍯", 25, 45, "Golden all the way through."], ["Sun Pie", "🥧", 45, 75, "Hot from a sun-warmed oven."]],
      sells: [["bread", 130]] },
    { kind: "florist", title: "Prickle Pots",
      keeper: { name: "Saguara", role: "Cactus keeper", talk: ["Cacti are perfect plants. They don't need you, and they don't pretend to.", "Water once a fortnight. Less if they look smug.", "Don't hug anything in here."] },
      regulars: [],
      sells: [["fertilizer", 18]], seeds: "all", plants: true },
  ],
  frost: [
    { kind: "tavern", title: "The Hearth Mug",
      keeper: { name: "Bjorn", role: "Keeper of the Hearth Mug", talk: ["Shut the door! You're letting the cold in.", "Mulled cider, warm by the fire. That's the only cure for Hoarshell.", "Ice-fishers come in here blue and leave pink."] },
      regulars: [
        { name: "Sigrid", role: "Ice-fisher", talk: ["Caught a fish this big today. Well, this big. Fine, small.", "The ice sings when it's about to crack. Listen for it."] },
        { name: "Little Nils", role: "Sled racer", talk: ["Fastest sled on the turtle. Ask anyone. Ask Sigrid. Don't ask Sigrid.", "Hot cocoa before a race. Never after. Learned that the hard way."] },
      ], extras: 1,
      menu: [["Warm Mead", "🍺", 25, 40, "Warms you to your toes."], ["Mulled Cider", "🍷", 35, 60, "Spiced and steaming."], ["Fireside Toddy", "☕", 60, 100, "The cold can't touch you now."]],
      sells: [["juice", 95]] },
    { kind: "teahouse", title: "Cocoa Corner",
      keeper: { name: "Elsa", role: "Cocoa maker", talk: ["Marshmallows? Of course marshmallows. I'm not a monster.", "The secret is a pinch of salt. Don't tell Bjorn.", "Snow outside, cocoa inside. That's Hoarshell."] },
      regulars: [{ name: "Grandpa Olav", role: "Storyteller", talk: ["When I was a boy, this turtle swam to the end of the world. Or so my grandpa said.", "Sit, sit. Have I told you about the frost feather? It flies by itself, they say."] }],
      menu: [["Hot Cocoa", "☕", 18, 35, "Rich and chocolatey."], ["Snow Tea", "🍵", 22, 40, "Minty and clear-headed."], ["Fish Chowder", "🍲", 40, 80, "Thick, hot and filling."]],
      sells: [["jam", 120]] },
    { kind: "bakery", title: "Frostbite Buns",
      keeper: { name: "Pella", role: "Baker of Hoarshell", talk: ["Ovens on all day here. Best job on a frozen turtle.", "Cardamom buns. You'll come back for more.", "Got milk? Cold milk keeps forever here. I'll buy it."] },
      regulars: [],
      menu: [["Cardamom Bun", "🥐", 15, 25, "Warm and spicy."], ["Berry Pie", "🥧", 30, 55, "Tart and lovely."], ["Snowflake Cake", "🍰", 45, 80, "Light as fresh snow."]],
      sells: [["bread", 130]] },
  ],
  mire: [
    { kind: "tavern", title: "The Soggy Boot",
      keeper: { name: "Grub", role: "Barkeep of the Soggy Boot", talk: ["Wipe your feet. Or don't, nobody else does.", "Swamp Grog. Green, murky, and it puts hair on your shell.", "Frogs sing louder after closing. They think the place is theirs."] },
      regulars: [
        { name: "Wick", role: "Lantern lighter", talk: ["Lit every lamp on the boardwalk tonight. Twice. The fog keeps blowing them out.", "If you see a light out in the marsh with nobody holding it, walk the other way."] },
        { name: "Hazel", role: "Mushroom forager", talk: ["Found a wildcap the size of my hat. Ate it. Don't ask.", "The bog pearl's real. Green as moss. I've seen one."] },
      ], extras: 1,
      menu: [["Swamp Grog", "🍺", 25, 40, "Murky, but it works."], ["Mossberry Wine", "🍷", 35, 60, "Earthy and sweet."], ["Bog Brew", "🧪", 60, 100, "Tastes awful. You feel amazing."]],
      sells: [["juice", 95]] },
    { kind: "teahouse", title: "Bog Tea House",
      keeper: { name: "Auntie Moss", role: "Tea brewer", talk: ["Every tea here is from the marsh. Every single leaf.", "Sit down, dear, you look damp.", "Reed tea for the nerves. Mushroom soup for everything else."] },
      regulars: [{ name: "Brother Fennick", role: "Quiet monk", talk: ["...", "The marsh teaches patience. And waterproof boots."] }],
      menu: [["Reed Tea", "🍵", 15, 30, "Calm and grassy."], ["Herbal Brew", "🍵", 25, 45, "Your head feels clearer."], ["Mushroom Soup", "🍲", 40, 80, "Earthy and filling."]],
      sells: [["jam", 115]] },
    { kind: "florist", title: "Mossy Pots",
      keeper: { name: "Ivy", role: "Swamp gardener", talk: ["Ferns, mosses, vines. Things that like it wet.", "A pothos will survive anything. Even you.", "Herbs grow best with their feet damp."] },
      regulars: [],
      sells: [["fertilizer", 15]], seeds: "all", plants: true },
  ],
  palm: [
    { kind: "tavern", title: "The Coconut Shack",
      keeper: { name: "Kai", role: "Beach barkeep", talk: ["Aloha! Grab a coconut, find some shade.", "Coconut Cooler, right out of the shell. No cups needed.", "Sunsets here are free. Drinks are not."] },
      regulars: [
        { name: "Nalu", role: "Surfer", talk: ["Waves were perfect this morning. Turtle waves, you know? Smooth.", "Coral bloom only opens at dawn. Saw one once. Changed my life, man."] },
        { name: "Captain Reed", role: "Retired sailor", talk: ["Sailed every sea there is. This is the only one that moves under you.", "Never trust a gull. They're all pirates."] },
      ], extras: 1,
      menu: [["Coconut Cooler", "🥥", 25, 40, "Ice cold and creamy."], ["Mango Splash", "🍹", 35, 60, "Tastes like summer."], ["Reef Rainbow", "🍸", 60, 100, "Seven colours, seven flavours!"]],
      sells: [["juice", 85]] },
    { kind: "florist", title: "Tide Garden",
      keeper: { name: "Leilani", role: "Florist of Coralcrest", talk: ["Tropical plants love a bit of sea air.", "Banana saplings, coconut palms... ask nicely and I might have one.", "Monsteras grow a new leaf every week here."] },
      regulars: [{ name: "Mele", role: "Flower weaver", talk: ["I make flower crowns for the harbour festival. Want one?", "Yellow for luck, pink for love, white for the sea."] }],
      sells: [["fertilizer", 16]], seeds: "all", rare: true, plants: true },
    { kind: "bakery", title: "Sweet Reef",
      keeper: { name: "Coco", role: "Pastry chef", talk: ["Everything here has coconut in it. Everything.", "Pineapple tart, fresh this morning!", "I'll take your fruit. All of it."] },
      regulars: [],
      menu: [["Coconut Bun", "🥥", 15, 25, "Soft and sweet."], ["Pineapple Tart", "🥧", 28, 50, "Tangy and golden."], ["Mango Cake", "🍰", 45, 80, "Tropical heaven."]],
      sells: [["bread", 130]] },
  ],
  ember: [
    { kind: "tavern", title: "The Lava Lamp",
      keeper: { name: "Brick", role: "Owner of the Lava Lamp", talk: ["Hot drinks, hot food, hot floor. Mind your feet.", "Lava Latte. Spicy coffee. Wakes the dead.", "Forge folk drink here. Loud, but good tippers."] },
      regulars: [
        { name: "Anvil Annie", role: "Blacksmith", talk: ["Hammered all day. Now I hammer this mug.", "Cinders make the hottest fire there is. Bring me some."] },
        { name: "Smoky", role: "Volcano watcher", talk: ["She rumbled twice today. Nothing to worry about. Probably.", "The ash makes the best sunsets on any turtle."] },
      ], extras: 1,
      menu: [["Ember Ale", "🍺", 25, 40, "Smoky and warm."], ["Lava Latte", "☕", 35, 60, "Spicy! You're wide awake."], ["Magma Shot", "🔥", 60, 100, "You could climb the volcano twice."]],
      sells: [["juice", 95]] },
    { kind: "bakery", title: "Ash Ovens",
      keeper: { name: "Cinder", role: "Baker of Emberback", talk: ["Volcano-heated ovens. Never run out of heat.", "Charcoal bread. It's black on purpose. Promise.", "Pepper buns for the brave."] },
      regulars: [{ name: "Flint", role: "Apprentice smith", talk: ["Annie sends me for buns every hour. I don't mind.", "The pepper buns made me cry. In a good way."] }],
      menu: [["Pepper Bun", "🌶", 15, 25, "Hot hot hot!"], ["Charcoal Loaf", "🍞", 25, 45, "Smoky and hearty."], ["Fire Cake", "🎂", 45, 80, "It glows a little."]],
      sells: [["bread", 130]] },
    { kind: "teahouse", title: "Smoke & Kettle",
      keeper: { name: "Old Soot", role: "Tea master", talk: ["Tea brewed on volcano steam. Nothing else like it.", "Sit. Breathe. Let the mountain do the boiling.", "Smoked tea, ash biscuits. Very Emberback."] },
      regulars: [],
      menu: [["Smoked Tea", "🍵", 15, 30, "Deep and toasty."], ["Spiced Chai", "☕", 25, 45, "Warming spices."], ["Fire Stew", "🍲", 40, 80, "Thick, hot and filling."]],
      sells: [["jam", 120]] },
  ],
};

/** a shop's trading counter key in SHOPS */
export const shopKey = (id, i) => `${id}_shop${i}`;
