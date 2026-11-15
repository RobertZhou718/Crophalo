# faostat_items.py: which FAOSTAT item is which Crophalo crop (written 2026-11-14).
# Reads:   nothing. It is a table, used by faostat.py.
# From:    the item names are FAO's own, copied letter for letter from the item list inside FAOSTAT's bulk file
#          "Production: Crops and livestock products" as it was published on 2026-11-14.
# Returns: ITEMS (FAO item name -> crop id), NO_YIELD (crop ids that get an area but never a yield or a price).
# Checked by: scripts/test_live_crops.mjs (every name is still an item of the recorded FAO file; the merges; no yield for the catch-alls).
#
# A name FAO changes simply stops matching: that crop then has no figure (and faostat.py names it in "items_not_found"),
# never a figure from another item. Totals ("Cereals, primary", "Citrus Fruit, Total") are left out on purpose: they
# would count the same land twice.
ITEMS = {
    # grains
    "Maize (corn)": "corn", "Wheat": "wheat", "Barley": "barley", "Sorghum": "sorghum", "Oats": "oats", "Rye": "rye",
    "Rice": "rice", "Millet": "millet", "Quinoa": "quinoa", "Buckwheat": "buckwheat", "Triticale": "triticale",
    # pulses and oil crops
    "Soya beans": "soy", "Chick peas, dry": "chickpea", "Lentils, dry": "lentil", "Peas, dry": "pea", "Beans, dry": "bean",
    "Broad beans and horse beans, dry": "faba", "Cow peas, dry": "cowpea", "Groundnuts, excluding shelled": "groundnut",
    "Pigeon peas, dry": "pigeonpea", "Lupins": "lupin", "Bambara beans, dry": "bambara",
    "Sunflower seed": "sunflower", "Rape or colza seed": "canola", "Sesame seed": "sesame", "Safflower seed": "safflower",
    "Linseed": "flax", "Mustard seed": "mustardseed",
    # fibre, roots, sugar
    "Seed cotton, unginned": "cotton", "Jute, raw or retted": "jute",
    "Hempseed": "hemp", "True hemp, raw or retted": "hemp",
    "Potatoes": "potato", "Sweet potatoes": "sweetpotato", "Cassava, fresh": "cassava", "Yams": "yam", "Taro": "taro",
    "Sugar beet": "sugarbeet", "Sugar cane": "sugarcane",
    # vegetables and tobacco
    "Tomatoes": "tomato", "Onions and shallots, dry (excluding dehydrated)": "onion", "Cabbages": "cabbage",
    "Watermelons": "watermelon", "Chillies and peppers, green (Capsicum spp. and Pimenta spp.)": "pepper",
    "Unmanufactured tobacco": "tobacco", "Carrots and turnips": "carrot", "Green garlic": "garlic",
    "Lettuce and chicory": "lettuce", "Cucumbers and gherkins": "cucumber", "Eggplants (aubergines)": "eggplant",
    "Okra": "okra", "Pumpkins, squash and gourds": "pumpkin", "Green corn (maize)": "sweetcorn", "Spinach": "spinach",
    "String beans": "greenbean", "Other beans, green": "greenbean", "Cantaloupes and other melons": "melon",
    "Cauliflowers and broccoli": "cauliflower", "Asparagus": "asparagus",
    # crops that stay in the ground
    "Tea leaves": "tea", "Hazelnuts, in shell": "hazelnut", "Coffee, green": "coffee", "Cocoa beans": "cocoa",
    "Oil palm fruit": "oilpalm", "Natural rubber in primary forms": "rubber",
    "Bananas": "banana", "Plantains and cooking bananas": "banana",
    "Oranges": "citrus", "Tangerines, mandarins, clementines": "citrus", "Lemons and limes": "citrus",
    "Pomelos and grapefruits": "citrus",
    "Olives": "olive", "Grapes": "grape", "Apples": "apple", "Pears": "apple",
    "Peaches and nectarines": "stonefruit", "Apricots": "stonefruit", "Cherries": "stonefruit",
    "Sour cherries": "stonefruit", "Plums and sloes": "stonefruit",
    "Almonds, in shell": "almond", "Walnuts, in shell": "walnut", "Pistachios, in shell": "pistachio",
    "Cashew nuts, in shell": "cashew", "Coconuts, in shell": "coconut", "Mangoes, guavas and mangosteens": "mango",
    "Dates": "datepalm", "Avocados": "avocado", "Pineapples": "pineapple", "Strawberries": "strawberry",
    "Blueberries": "blueberry", "Raspberries": "raspberry", "Kiwi fruit": "kiwi", "Figs": "fig",
    "Chestnuts, in shell": "chestnut", "Pepper (Piper spp.), raw": "blackpepper",
    "Nutmeg, mace, cardamoms, raw": "cardamom", "Vanilla, raw": "vanilla",
    "Cinnamon and cinnamon-tree flowers, raw": "cinnamon", "Hop cones": "hops",
    "Sisal, raw": "sisal", "Agave fibres, raw, n.e.c.": "sisal", "Papayas": "papaya",
    # catch-alls: they answer only "does this country grow anything of this kind"
    "Other nuts (excluding wild edible nuts and groundnuts), in shell, n.e.c.": "nuts_nec",
    "Other tropical fruits, n.e.c.": "tropfruit_nec", "Other fruits, n.e.c.": "fruit_nec", "Cereals n.e.c.": "cereals_nec",
}

# An area only, never a yield or a price: the catch-alls are a mix of unlike crops, and hemp is seed and stalk of the
# same plants (tonnes of seed and tonnes of fibre over the two areas added up would be a yield of nothing real).
NO_YIELD = frozenset(("nuts_nec", "tropfruit_nec", "fruit_nec", "cereals_nec", "hemp"))
