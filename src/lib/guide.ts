// How the app behaves today, written as the scenarios it is actually used for.
// This file is the single source for the in-app Guide page (/guide) and for agents working
// on the code. It describes current behaviour only: when a change alters what a button does
// or how a figure is worked out, update the matching entry here in the same change.

export type GuideFigure = {
  id: string;
  name: string;
  // Page the figure is shown on
  where: string;
  formula: string;
  notes: string[];
};

export type GuideStep = {
  // Page or panel the step happens on
  where: string;
  href?: string;
  action: string;
};

export type GuideScenario = {
  id: string;
  title: string;
  // When this scenario applies
  when: string;
  steps: GuideStep[];
  // What the figures do as a result
  numbers: string[];
  watchOut?: string[];
};

export const figures: GuideFigure[] = [
  {
    id: 'spending-power',
    name: 'Spending power',
    where: 'Dashboard',
    formula: 'Money in (net) − money out',
    notes: [
      'Money in (net) is every income: amount + shipping revenue − platform fees − payment fees − shipping cost.',
      'Money out is every expense, counted when it is recorded, whatever it was for.',
      'Tax collected is tracked on its own and is not part of either side.',
      'It is cash based. Buying a part lowers it straight away; using that part on a work order, or harvesting parts from a donor, does not move it.',
      'The 30 day version uses the date on each income and expense.',
      'Archived incomes and expenses are left out.'
    ]
  },
  {
    id: 'parts-inventory-value',
    name: 'Parts inventory value',
    where: 'Dashboard',
    formula: 'For each part: quantity in stock × unit cost',
    notes: [
      'Unit cost is the average cost from receipts once the part has been received on a Split Receipt or harvested from a donor. Before that it is the unit cost typed on the Parts page.',
      'Each receipt re-averages: (current unit cost × quantity in stock + cost of the receipt) ÷ new quantity.',
      'Parts consumed (30d) is the cost of parts put on work orders in the last 30 days, less any that were taken back off.'
    ]
  },
  {
    id: 'device-net',
    name: 'Device net',
    where: 'Devices list (Net) and device page (Net Profit)',
    formula: 'Income − fees + shipping net − expenses − parts used',
    notes: [
      'Income is every income with this device picked on it. An income with only a work order picked is not credited to any device.',
      'A Sale Builder sale counts through its device lines, each with its share of the fees and shipping.',
      'Fees are platform and payment fees. Shipping net is shipping revenue minus shipping cost. Tax collected is left out.',
      'Expenses are the expenses with this device picked on them.',
      'An expense that was received into parts stock is left out here, marked "(stock)" on the device page. Its cost arrives as parts used when the part goes on a work order.',
      'Value harvested from the device into parts stock is taken off its expenses (never below $0).',
      'Parts used are part items on work orders charged to this device: the device picked on the item, or the only device on the work order when none was picked. The cost is the part cost at the moment it was added.'
    ]
  },
  {
    id: 'work-order-profit',
    name: 'Work order profit',
    where: 'Work order page',
    formula: 'Net revenue − parts cost − device expenses',
    notes: [
      'Net revenue is every income with this work order picked on it: amount + shipping revenue − platform fees − payment fees − shipping cost. Several incomes add up.',
      'Parts cost is each part item: quantity × the part cost at the moment it was added. Deleting the item puts the part back in stock and removes the cost.',
      'Device expenses are the expenses of each device on the work order whose "Device cost" is counted here, less anything received into parts stock or harvested.',
      'A device counts its cost on one work order only. The first work order it is added to gets it; "Count cost here" moves it and "Exclude cost" drops it.',
      'A device added with the role Donor never counts its cost on the work order. Its cost is charged through the parts harvested from it.',
      'Prices on the lines are what you plan to charge. They are not revenue and not a cost: revenue only appears when an income is recorded. Setting or changing a price never changes this figure.',
      'If any Sale Builder sale is tied to the work order, only Sale Builder lines count as revenue and plain incomes on the same work order are ignored.'
    ]
  },
  {
    id: 'invoice-total',
    name: 'Invoice total',
    where: 'Work order page',
    formula: 'Part prices + labor prices + device prices',
    notes: [
      'Part line: price each × quantity. The price each is the part cost at the moment it was added plus the parts markup, rounded to the cent (half a cent rounds up), unless a price was typed on the line. Example: a $15.00 part at 30% is $19.50 each, so two are $39.00.',
      'A typed price is per unit and shows the markup it works out to, for example "$80.00, 433%" on a $15.00 part. It is negative when the price is below cost. "Use default" drops the typed price.',
      'A part that cost $0 (for example one harvested from a free donor) has a default price of $0 and is marked "Needs a price".',
      'Labor line: its amount, which can be changed in the Price column. Note lines are never charged.',
      'Device line: the price typed for it. A Primary device on a "Return to customer" work order is the customer\'s own and has no price; Accessory and Donor rows can always have one. A device with no price typed adds nothing.',
      'Archived lines and removed devices are left out.',
      'It is a plan, not money: it does not move spending power, profit or any device net.'
    ]
  },
  {
    id: 'parts-markup',
    name: 'Parts markup and "invoiced"',
    where: 'Settings > Pricing, and the work order page',
    formula: 'Not invoiced: the current default. Invoiced: the default on the day it was invoiced',
    notes: [
      'The default parts markup is one percentage under Settings > Pricing. It starts at 30%.',
      'While a work order is not invoiced, its part lines on the default price follow the current setting, so changing the setting moves them.',
      'A work order becomes invoiced when the first income is recorded against it (Add Income, an income edited to point at it, or a Sale Builder sale, even for $0) or when "Mark invoiced" is clicked, whichever comes first. The markup at that moment is stored on the work order and used from then on, including for parts added later.',
      'The invoiced date is the date on that first income, so an income entered late still dates the invoice correctly. "Mark invoiced" uses today.',
      'Once invoiced it stays invoiced: later payments change nothing, and archiving or moving the payment does not undo it. "Undo invoiced" is the only way back, and puts the default-priced parts on the current setting again.',
      'Typed prices are never changed by the setting, invoiced or not.',
      'Work orders that were already Delivered, Cancelled or paid when line prices were introduced count as invoiced with no markup: their parts show "Not priced" unless a price is typed. Their invoiced date is the date of their earliest payment, or the day they were last changed if they had none.'
    ]
  },
  {
    id: 'expected-profit',
    name: 'Expected profit, received and balance due',
    where: 'Work order page',
    formula: 'Expected profit = invoice total − total cost. Balance due = invoice total − received',
    notes: [
      'Total cost is the same parts cost and device expenses used for work order profit.',
      'Received is the amount on every income tied to the work order, before fees, shipping and tax. Archived incomes are left out.',
      'A Sale Builder sale counts through its lines, so a line pointed at another work order is received there. Plain incomes and Sale Builder sales on the same work order both count here.',
      'Balance due is negative when more was received than the invoice total.',
      'Expected profit is what the job makes if the invoice is paid in full with no fees. Work order profit is what it has made so far from the incomes actually recorded.'
    ]
  }
];

export const scenarios: GuideScenario[] = [
  {
    id: 'buy-fix-sell',
    title: 'Buy a device, fix it and sell it',
    when: 'You paid for the device and will sell it, as-is or after a repair.',
    steps: [
      { where: 'Devices', href: '/devices', action: 'Add Device. The SKU is generated for you. There is no price field here.' },
      { where: 'Expenses', href: '/expenses', action: 'Add Expense for what you paid, category Device Purchases, and pick the device. This is the device\'s cost.' },
      { where: 'Work Orders', href: '/work-orders', action: 'New Work Order with Target Action "Sell".' },
      { where: 'Work order', action: 'Under Devices, add the device as Primary. Its cost is counted on this work order.' },
      { where: 'Work order', action: 'Under Items, add each Part used (it must be in stock) and pick the device. Add Labor or Note lines if useful.' },
      { where: 'Work order', action: 'Type the sale price in the device\'s Price column. Parts fitted are priced too and add to the invoice total; type $0 on a part that is included in the device price.' },
      { where: 'Income', href: '/income', action: 'When it sells: Add Income, type Sale, with the amount, fees and shipping. Pick both the Device and the Work Order. This marks the work order invoiced.' },
      { where: 'Devices and Work Orders', action: 'Set the device status to Sold and the work order status to Delivered. Neither changes on its own.' }
    ],
    numbers: [
      'Spending power drops when the purchase and any parts are bought, and rises when the sale is recorded.',
      'Work order profit = sale (net of fees and shipping cost) − parts used − the device\'s purchase and other expenses.',
      'Device net shows the same result, because the income, the expenses and the parts all point at the device.',
      'Invoice total is the device price plus part and labor prices; balance due drops to $0 once incomes for that amount are recorded.'
    ],
    watchOut: [
      'Pick both the Device and the Work Order on the income. With only the work order, the device shows a loss; with only the device, the work order shows no revenue.'
    ]
  },
  {
    id: 'sell-own-stock',
    title: 'Sell something you already owned',
    when: 'The item cost the business nothing, for example personal stock from before the app.',
    steps: [
      { where: 'Devices', href: '/devices', action: 'Add Device. Do not record a purchase expense.' },
      { where: 'Income', href: '/income', action: 'Add Income, type Sale, and pick the Device. A work order is optional.' },
      { where: 'Devices', href: '/devices', action: 'Set the status to Sold.' }
    ],
    numbers: ['Device net = sale − fees + shipping net. There is no cost to take off.', 'Spending power rises by the net amount received.']
  },
  {
    id: 'customer-repair',
    title: 'Repair a customer\'s device and return it',
    when: 'The device belongs to the customer. You charge for parts and labor.',
    steps: [
      { where: 'Customers', href: '/customers', action: 'Add the customer if they are new.' },
      { where: 'Devices', href: '/devices', action: 'Add Device for the customer\'s device. Do not record a purchase expense.' },
      { where: 'Work Orders', href: '/work-orders', action: 'New Work Order with Target Action "Return to customer" and the customer picked.' },
      { where: 'Work order', action: 'Add the device as Primary. It is the customer\'s device, so it has no price. Add Part items for what you fit and Labor lines for what you will charge.' },
      { where: 'Work order', action: 'Check the Price column. Each part is priced at cost plus the parts markup; type a price each to override it, or change a labor amount.' },
      { where: 'Income', href: '/income', action: 'When paid: Add Income, type Service, for the amount received. Pick the Work Order, the Device and the Customer. The first payment marks the work order invoiced.' },
      { where: 'Work Orders', href: '/work-orders', action: 'Set the work order status to Delivered.' }
    ],
    numbers: [
      'Invoice total = part prices + labor. Expected profit = invoice total − cost of the parts used.',
      'Work order profit = amount received (net) − cost of the parts used. The work order is charged parts at cost; the markup shows up as profit.',
      'What counts as money is still whatever you put on the income. The invoice total is what you plan to charge, and balance due is the difference.',
      'A second payment is another income on the same work order. They add up under Received.'
    ],
    watchOut: ['With several devices on one work order, pick the device on each Part item. A part with no device on a work order with several devices is charged to the work order but to no device.']
  },
  {
    id: 'device-returns',
    title: 'A device comes back for another job',
    when: 'A device you sold, or repaired before, returns for a new repair.',
    steps: [
      { where: 'Work Orders', href: '/work-orders', action: 'New Work Order. Do not reopen the old one.' },
      { where: 'Work order', action: 'Add the same device as Primary. Device cost shows "Not counted" with a link to the work order that carries it.' },
      { where: 'Work order', action: 'Leave it that way. Add parts and labor, then record the income as for any repair.' }
    ],
    numbers: [
      'The new work order starts at $0, not at minus the purchase price. The purchase stays on the original work order.',
      'Device net is the device\'s whole history: both incomes, its purchase, and the parts from both jobs.'
    ],
    watchOut: ['"Count cost here" on the new work order takes the cost off the original one. Use it only if the cost was on the wrong work order to begin with.']
  },
  {
    id: 'donor',
    title: 'Use a donor device for parts',
    when: 'You bought a device to strip for parts across several repairs, not to sell.',
    steps: [
      { where: 'Devices', href: '/devices', action: 'Add Device, then edit it and set the status to Donor.' },
      { where: 'Expenses', href: '/expenses', action: 'Add Expense for what you paid, with the donor picked. Skip this for a free donor.' },
      { where: 'Donor\'s device page', action: 'Under Harvested Parts, add each part you pull: pick or name the part, a quantity, and a value each. The value is the share of the donor\'s cost that part carries. Use $0 for a free donor.' },
      { where: 'Work order', action: 'On the job the part goes into, add it under Items as a Part, like any other part. A part harvested at $0 shows "Needs a price": type what you charge for it.' },
      { where: 'Income', href: '/income', action: 'Record the payment for that job as usual.' }
    ],
    numbers: [
      'Harvesting moves cost, not cash: the donor\'s net improves by the harvested value and parts inventory value rises by the same amount. Spending power does not move.',
      'Each work order that uses a harvested part is charged that part\'s cost.',
      'Whatever is never harvested stays on the donor as a loss. A donor can get back to $0 but does not show a profit; the profit shows on the jobs its parts went into.',
      'Example: a $100 donor with $60 of parts harvested shows a net of −$40.'
    ],
    watchOut: [
      'Adding the donor as a device on a work order with the role Donor is optional. Its cost is never counted there ("Recouped through its parts") and there is no "Count cost here" on that row. Its Price is for anything you charge for what was taken from it.',
      'Pick the role Donor when adding it. Added as Primary or Accessory, the donor\'s remaining cost is charged to that one job on top of the parts.',
      'The values harvested from a donor cannot add up to more than its expenses.',
      'A harvest can be undone on the donor\'s page until its parts are used. After that, delete the part from the work order first.',
      'Only a device with the status Donor can be harvested.'
    ]
  },
  {
    id: 'accessory',
    title: 'Sell an accessory along with a device',
    when: 'A controller, cable or similar goes out with another sale.',
    steps: [
      { where: 'Devices', href: '/devices', action: 'Add Device for the accessory, and an Expense with it picked if you paid for it.' },
      { where: 'Work order', action: 'On the sale\'s work order, add the accessory under Devices with the role Accessory, and type what you charge for it under Price.' },
      { where: 'Income', href: '/income', action: 'Record the sale. One income holds one device, so to credit the accessory, record two incomes on the same work order: one with the main device, one with the accessory.' }
    ],
    numbers: [
      'The accessory\'s expenses count on the sale\'s work order, unless an earlier work order (such as its own repair) already carries them.',
      'With two incomes, each device shows its own net and the work order adds both together.',
      'With a single income on the main device, the main device\'s net includes the accessory\'s price and the accessory shows only its cost.'
    ],
    watchOut: ['If the accessory had its own repair work order first, its cost stays there and shows "Not counted" on the sale. Click "Count cost here" on the sale if you want it there.']
  },
  {
    id: 'buy-parts',
    title: 'Buy parts',
    when: 'You are buying parts for stock, for a specific device, or both on one invoice.',
    steps: [
      { where: 'Expenses', href: '/expenses', action: 'Open Split Receipt and enter the invoice date, vendor, tax, shipping and other fees.' },
      { where: 'Split Receipt', action: 'Add a line per item with a Parts category. Pick the Part (or type a New Part Name) and a Qty to receive it into stock.' },
      { where: 'Split Receipt', action: 'Pick a Device on a line if the part was bought for that device. Lines for other things (tools, supplies) go on the same receipt without a part.' },
      { where: 'Parts', href: '/parts', action: 'For stock you already own, Add Part with a quantity and unit cost. No expense is recorded.' }
    ],
    numbers: [
      'Tax, shipping and fees are spread across the lines by the chosen method, so each part\'s cost includes its share.',
      'Spending power drops by the invoice total at once. Parts inventory value rises by the lines received into stock.',
      'A part received into stock for a device is not charged to the device yet. It is charged when the part is added to a work order.'
    ],
    watchOut: [
      'Add Expense cannot receive a part into stock. Only Split Receipt does, and only on lines whose category name contains "part".',
      'A Parts line with a device but no part and quantity is a plain device expense. It is charged to the device straight away and nothing enters stock.'
    ]
  },
  {
    id: 'record-income',
    title: 'Record income',
    when: 'Any money received.',
    steps: [
      { where: 'Income', href: '/income', action: 'Add Income. Enter the amount, then fees, shipping revenue, shipping cost and tax collected if any.' },
      { where: 'Add Income', action: 'Pick the Work Order if it was for a job, and the Device it was for. Either, both or neither is allowed.' }
    ],
    numbers: [
      'Work Order picked: counts as that work order\'s revenue and under its Received. If it is the first payment against the work order, the work order becomes invoiced.',
      'Device picked: counts toward that device\'s net.',
      'Neither picked: counts in spending power only.'
    ],
    watchOut: [
      'Sale Builder records one sale as several lines. A Device line sets that device to Sold. A Part line with a quantity takes the part out of stock itself.',
      'Do not use a Sale Builder Part line for a part that is already on the work order: stock is taken twice, and the Sale Builder consumption is not in the work order\'s parts cost.',
      'Add Income never changes a device\'s status or parts stock.'
    ]
  },
  {
    id: 'fix-mistakes',
    title: 'Undo or correct something',
    when: 'An entry was wrong.',
    steps: [
      { where: 'Income or Expenses', action: 'Edit the row, or archive it. An archived row drops out of every figure.' },
      { where: 'Work order', action: 'Delete a Part item to put the part back in stock and remove its cost.' },
      { where: 'Work order', action: 'Remove a device, or use "Exclude cost" / "Count cost here" to change which work order carries its cost.' },
      { where: 'Work order', action: 'Retype a price and Save, or click "Use default" on a part. "Undo invoiced" releases the stored markup.' },
      { where: 'Donor\'s device page', action: 'Undo a harvest to take the parts back out of stock and put the cost back on the donor.' },
      { where: 'Parts', href: '/parts', action: 'Use the + and − buttons to correct a stock count.' }
    ],
    numbers: ['Nothing is deleted outright. Devices, parts, customers, work orders, incomes and expenses are archived and hidden.'],
    watchOut: [
      'Archiving an expense that received parts into stock does not take those parts back out. Correct the quantity on the Parts page.',
      'The + and − buttons on Parts change the count only. They record no cost and no expense.',
      'Archiving or moving an income does not undo "invoiced" on its work order. Use "Undo invoiced" if it should follow the current markup again.'
    ]
  }
];
