# -*- coding: utf-8 -*-
"""Per-marque copy for the <make>-apple-carplay-london pages, plus the four
BMW/MINI software pages.

The 10 CarPlay marque pages were 57-66% phrase-identical to each other and the
four software pages 35-45%. Each entry below supplies content that only applies
to that marque or that job: which head unit is actually in the car, whether the
work is an activation or a retrofit, what is kept, and what cannot be done.

Head-unit generations are named where they are well established, and every
entry defers to a VIN check for the exact variant - build dates move these
boundaries and we do not guess on a customer's behalf.
"""

CARPLAY = {
"bmw": dict(
 name="BMW", file="bmw-apple-carplay-london",
 sysline="iDrive CIC, NBT, NBT EVO and the newer EVO ID5/ID6 systems",
 intro="What we can do to a BMW depends entirely on which iDrive is in it, and BMW changed generations more often than most manufacturers. A car with NBT EVO may already have the hardware and need nothing more than an activation. A CIC car needs an interface. And a 2019-on car with factory CarPlay on a subscription is a different conversation again. We check the head unit from your VIN before quoting, because the difference between those cases is significant and we would rather be right than optimistic.",
 how="On the later systems the work is coding rather than hardware: the CarPlay capability is present in the car and is enabled, which is the cleanest outcome available - nothing is added, nothing is removed, and the car behaves exactly as a factory-equipped one does. On CIC and earlier NBT cars we fit an interface behind the dash that feeds the factory screen, and your iDrive rotary controller continues to operate everything. Split-screen CarPlay can be set to fullscreen on the systems that support it, which is the single change most BMW owners ask for once they have lived with it.",
 keeps="Reversing and 360-degree cameras are retained and integrated where the system supports it, steering-wheel controls keep working, and factory radio, media and navigation all remain. Nothing is removed and no aftermarket head unit goes in.",
 faqs=[("Does my BMW need a retrofit or just an activation?",
        "It depends on the iDrive generation, and we check it from your VIN before quoting. Later NBT EVO cars often already have the hardware and only need coding to enable it - the cleanest possible outcome. CIC and earlier NBT cars need an interface fitted behind the dash. The two are quite different jobs and prices."),
       ("Can I get rid of the split screen?",
        "On the systems that support it, yes - CarPlay can be set to fullscreen rather than sharing the display. It is the change most BMW owners ask for once they have used it for a week, and we set it up at the fitting."),
       ("Will my reversing camera and iDrive controller still work?",
        "Yes. Cameras are retained and integrated where the system supports it, and the iDrive rotary controller continues to operate everything including CarPlay. Steering-wheel controls are unaffected.")]),

"mercedes": dict(
 name="Mercedes-Benz", file="mercedes-apple-carplay-london",
 sysline="COMAND NTG4.5, NTG5, NTG5.5 and MBUX (NTG6)",
 intro="Mercedes infotainment generations are named NTG, and which one you have decides everything. An NTG5.5 car may support activation through coding. NTG4.5 and NTG5 cars generally need an interface. MBUX cars usually have CarPlay from the factory, and if yours does not appear to, the answer is often a configuration issue rather than missing hardware. We identify the exact unit from your VIN first - on this marque in particular, model year alone is not enough to tell.",
 how="Where activation is possible it is by far the better route: the capability is enabled in the car's own software and there is no additional hardware in the dash at all. Where an interface is needed we fit it behind the COMAND unit and feed the factory display, keeping the rotary controller or touchpad as the input. On the AMG cars and the ones with the extended trim, access takes longer and we book the extra time rather than rushing a panel that shows every mark.",
 keeps="The COMAND controller and touchpad, steering-wheel controls, reversing and 360-degree cameras, DAB, factory navigation and the Burmester or Harman system all continue to work exactly as before.",
 faqs=[("Which COMAND system do I have?",
        "We identify it from your VIN, and it matters more on Mercedes than on most marques - model year alone will not tell you. NTG4.5, NTG5, NTG5.5 and MBUX are all handled differently, and NTG5.5 may support activation through coding rather than needing hardware."),
       ("My car is MBUX and CarPlay is not showing. Is that a retrofit?",
        "Usually not. On MBUX cars CarPlay is normally present from the factory, so a car where it is missing is more often a configuration or activation issue than absent hardware. We check before quoting anything, and if that is all it is, we say so."),
       ("Will the Burmester system and 360 camera still work?",
        "Yes - the audio system, cameras, DAB, factory navigation, the COMAND controller and the touchpad all continue to work as standard. Nothing is removed.")]),

"audi": dict(
 name="Audi", file="audi-apple-carplay-london",
 sysline="MMI 3G, MMI 3G+, MMI Touch and the MIB2 and MIB3 platforms",
 intro="Audi's advantage here is that a great many cars already have the hardware. On the MIB2 platform, Audi Smartphone Interface is frequently present and simply not enabled, which means the job is a software activation rather than an installation - no interface, nothing added to the dash, and the car behaves exactly as a factory-specified one. On the older MMI 3G and 3G+ cars an interface is required instead. We check which applies from your VIN before we quote.",
 how="An activation is the cleanest work we do: we enable the capability that is already in the car and hand it back with nothing in the dash that was not there before. Where an interface is needed on MMI 3G or 3G+, it goes behind the unit and feeds the factory screen, with the MMI rotary controller or touchpad still doing the driving. On the RS and S cars with the lower centre console, access is tighter and it takes a little longer.",
 keeps="MMI rotary control or touch, steering-wheel controls, reversing and 360-degree cameras, DAB, factory navigation and the Bang &amp; Olufsen system are all retained.",
 faqs=[("Is my Audi just an activation?",
        "Often, yes. On MIB2 cars the Audi Smartphone Interface hardware is frequently already present and simply not enabled, in which case the job is a coding activation with nothing added to the dash. MMI 3G and 3G+ cars need an interface instead. We check from your VIN before quoting."),
       ("What is the difference in cost between the two?",
        "Considerable, which is exactly why we check first rather than quoting a single price for every Audi. An activation is the cheaper and cleaner outcome and we will tell you if that is what your car needs."),
       ("Does the MMI controller still work with CarPlay?",
        "Yes. The MMI rotary controller or touchpad continues to operate everything, along with the steering-wheel controls. Cameras, DAB, factory navigation and the Bang & Olufsen system are all retained.")]),

"volkswagen": dict(
 name="Volkswagen", file="volkswagen-apple-carplay-london",
 sysline="Discover Media and Discover Pro on the MIB1, MIB2 and MIB3 platforms",
 intro="Volkswagen calls its smartphone integration App-Connect, and on a great many MIB2 cars it is present in the head unit and switched off. That makes Volkswagen one of the marques where the honest answer is most often the cheap one: not a retrofit, just an activation. Golf R, GTI, Tiguan, Touareg, Passat and Arteon owners come to us expecting a hardware job and frequently leave having paid for coding. MIB1 cars are the exception and need an interface.",
 how="Where App-Connect can be activated, we enable it in the unit's own software - nothing is fitted, nothing is opened up, and the car is indistinguishable from one specified with it new. Where a MIB1 or earlier unit needs an interface, it goes in behind the head unit and drives the factory screen, with the original controls retained. Either way the work is done at your address and takes a fraction of a day.",
 keeps="Factory radio, DAB, media, navigation where fitted, steering-wheel controls and the reversing camera all continue to work as standard.",
 faqs=[("Is App-Connect already in my Volkswagen?",
        "On a lot of MIB2 cars, yes - the hardware is in the head unit and simply switched off, so the job is a coding activation rather than a retrofit. MIB1 cars need an interface. We check which you have before quoting, and if yours only needs activation we will tell you that."),
       ("Does that mean it is cheap?",
        "An activation is significantly cheaper than a hardware retrofit, yes. It is one of the few jobs where the honest answer is usually the inexpensive one, and we would rather say so than sell you an interface you do not need."),
       ("Will it work wirelessly?",
        "That depends on the unit. Some support wireless CarPlay and some are wired only, and it is determined by the head unit rather than by anything we fit. We confirm which yours does at the same time as we identify the platform.")]),

"mini": dict(
 name="MINI", file="mini-apple-carplay-london",
 sysline="MINI Connected, built on BMW's NBT and NBT EVO platforms",
 intro="MINI infotainment is BMW's, rebadged - MINI Connected runs on the same NBT and NBT EVO platforms as iDrive, with a different interface layer on top. That is good news, because it means the same activation and retrofit routes apply and the hardware is well understood. What differs is the packaging: an F55 or F56 dash is smaller and more tightly packed than a 3 Series, so an interface installation is a more delicate job than the equivalent BMW.",
 how="On later NBT EVO cars the capability is often present and needs enabling, which is a coding job with nothing added. On earlier cars we fit an interface behind the centre screen and feed the factory display, keeping the MINI controller as the input. The circular centre display and the surrounding trim ring are not forgiving, so panels are released properly rather than persuaded - that is the main practical difference from doing the same work on a BMW.",
 keeps="The MINI controller, steering-wheel controls, reversing camera, DAB and factory navigation are all retained, and the distinctive centre-display layout is unaffected.",
 faqs=[("Is MINI CarPlay the same job as BMW?",
        "Technically similar - MINI Connected runs on BMW's NBT and NBT EVO platforms, so the same activation and retrofit routes apply. Practically it is more delicate: an F55 or F56 dash is smaller and more tightly packed, and the circular centre display and trim ring show any rough handling."),
       ("Can my MINI just be activated?",
        "On later NBT EVO cars, often yes - the capability is present and needs enabling, which is a coding job with nothing added to the dash. Earlier cars need an interface. We identify the unit from your VIN before quoting."),
       ("Will the round centre display still look right?",
        "Yes. We use the factory display and the MINI controller, so the layout is unchanged and there is no aftermarket head unit. The trim ring comes off properly and goes back the same way.")]),

"bentley": dict(
 name="Bentley", file="bentley-apple-carplay-london",
 sysline="the Continental GT and Flying Spur MMI-derived units, and the Bentayga's MIB platform",
 intro="Bentley infotainment varies more by model and year than almost any marque we work on, which is why we will not quote a Bentley CarPlay retrofit from a model name alone. The Continental GT and Flying Spur have used units derived from the Volkswagen Group's MMI platform across several generations; the Bentayga sits on MIB. Some of those cars can be activated. Others need an interface. We check from your registration and VIN and give you a firm price before you book.",
 how="Where activation is available it is the right answer - the capability is enabled in the car's software and nothing is added. Where an interface is needed it goes behind the factory unit and drives the original display, keeping the rotary controller and the steering-wheel switches as they are. The care on a Bentley goes into the cabin rather than the electronics: veneer, hide and knurled metal are unforgiving, and a panel that has been levered rather than released is visible forever. We work slowly and we do not cut.",
 keeps="The factory display, rotary controller, steering-wheel controls, reversing and 360-degree cameras, DAB and the Naim or factory audio system are all retained. Nothing aftermarket is visible in the cabin.",
 faqs=[("Why can't you quote from the model alone?",
        "Because Bentley infotainment varies significantly by model and build year, and the difference between an activation and a hardware retrofit is large. We check the exact unit from your registration and VIN and give you a firm price before you book, rather than a range that moves on the day."),
       ("Will it mark the veneer or the hide?",
        "It should not. Panels are released properly rather than levered, we use factory routes and existing looms, and nothing is cut or spliced. A Bentley cabin shows a mistake permanently and we fit accordingly."),
       ("Does the Naim system still work?",
        "Yes - the factory audio, the rotary controller, the steering-wheel switches, DAB and the cameras all continue to work as standard. There is no aftermarket head unit and nothing visible in the cabin.")]),

"rolls-royce": dict(
 name="Rolls-Royce", file="rolls-royce-apple-carplay-london",
 sysline="the BMW-derived systems in Ghost, Wraith and Dawn, and the newer Cullinan and Phantom units",
 intro="Rolls-Royce infotainment is BMW underneath. The Ghost, Wraith and Dawn use systems derived from iDrive's NBT generation, presented through a Rolls-Royce interface and a Spirit of Ecstasy rotary controller, and that shared foundation is why CarPlay retrofit and activation routes exist for these cars at all. The newer Cullinan and Phantom units are a later generation again. As always we confirm the exact system from the VIN before quoting.",
 how="Where the platform supports activation, we enable it in software and nothing is added to the car - the preferable outcome on any Rolls-Royce. Where an interface is required it sits behind the factory unit and feeds the original display, with the rotary controller still doing the work. The installation discipline matters more here than the electronics: lambswool, hide, veneer and coach doors all demand that trim is released properly, the starlight headliner is never on our routing path, and everything we fit is fully reversible.",
 keeps="The factory display, the rotary controller, steering-wheel controls, cameras, DAB and the bespoke audio system are all retained, and the cabin is left exactly as it was.",
 faqs=[("Is Rolls-Royce infotainment really BMW underneath?",
        "Yes - the Ghost, Wraith and Dawn use systems derived from iDrive's NBT generation, with a Rolls-Royce interface and the rotary controller on top. That shared foundation is precisely why CarPlay activation and retrofit routes exist for these cars. Cullinan and Phantom are a later generation."),
       ("Will you go near the starlight headliner?",
        "No. It is not on any routing path we use and we would not touch it. Trim is released properly rather than levered, we use factory routes and existing looms, and the installation is fully reversible with nothing left behind."),
       ("Does the bespoke audio system stay?",
        "Yes. The factory audio, the display, the rotary controller, the steering-wheel switches, DAB and the cameras all continue to work as standard. Nothing aftermarket is visible.")]),

"aston-martin": dict(
 name="Aston Martin", file="aston-martin-apple-carplay-london",
 sysline="the earlier DB9 and V8 Vantage units, the Mercedes-derived DB11 and Vantage systems, and the DBX",
 intro="Aston Martin has borrowed its infotainment from whoever it was partnered with at the time, and that history decides what is possible in your car. The earlier DB9 and V8 Vantage cars use units from the Ford era that are genuinely dated and are the ones owners most want improved. The DB11, DBS and current Vantage use Mercedes-derived systems, and the DBX is newer again. Each needs a different approach, and we identify which from the VIN rather than the badge on the boot.",
 how="On the Mercedes-derived cars the route is often the same as on a Mercedes, and where activation is possible that is what we do. On the earlier cars an interface is the answer, feeding the factory display so that the cabin is unchanged from the driver's seat. Those older Astons are hand-trimmed and the routing options are limited, so it is a slower and more careful job than a modern SUV - we would rather book the extra time than force a panel that will show it.",
 keeps="The factory display, the original controls, steering-wheel switches, reversing camera where fitted, DAB and the factory audio system are all retained, and the installation is fully reversible.",
 faqs=[("Can you improve the infotainment in an older DB9 or V8 Vantage?",
        "That is one of the most common things we are asked for on this marque. Those cars use Ford-era units that are genuinely dated, and an interface feeding the factory display gives you CarPlay without changing how the cabin looks. It is a careful job - hand-trimmed interiors and limited routing - and we book the time for it."),
       ("Is a DB11 the same job as a Mercedes?",
        "Broadly, yes - the DB11, DBS and current Vantage use Mercedes-derived systems, so the same activation and retrofit routes often apply. The DBX is newer again. We identify the exact unit from the VIN rather than working from the model name."),
       ("Will anything look aftermarket afterwards?",
        "No. We use the factory display and the original controls, so from the driver's seat nothing has changed except that CarPlay is there. The installation is fully reversible with nothing cut.")]),

"ferrari": dict(
 name="Ferrari", file="ferrari-apple-carplay-london",
 sysline="the F430, California, 458 and 488 units, and the larger displays in the 812, GTC4Lusso and Roma",
 intro="Ferrari infotainment has always been an afterthought next to the drivetrain, and owners of the F430, California, 458 and 488 generations know it. Those cars have small displays and limited functionality, and they are the ones we are most often asked to improve. The later 812, GTC4Lusso, Roma and SF90 have considerably better systems and a larger screen to work with. What is achievable differs sharply between the two groups, and we are straight about it before you book.",
 how="Where the factory display can usefully carry CarPlay we feed it with an interface behind the unit, keeping the original controls. On some of the earlier cars the display is genuinely too small to be worth it, and in that case we will tell you rather than take the work - a cramped CarPlay on a tiny screen is not an improvement. Access is the other constraint: mid-engined cars have very little room behind the trim, carbon should not be flexed, and the job is slower than it would be on a saloon.",
 keeps="The factory display and controls, steering-wheel switches, reversing camera where fitted and the factory audio system are all retained, and nothing is cut or drilled.",
 faqs=[("Is it worth adding CarPlay to a 458 or F430?",
        "Sometimes, and sometimes not - it depends on the display. Some of the earlier Ferrari screens are genuinely too small for CarPlay to be an improvement, and where that is the case we will say so rather than take the work. The later 812, GTC4Lusso and Roma have much more to work with."),
       ("Is there room to fit an interface in a mid-engined Ferrari?",
        "There is, but it is tight - very little space behind the trim, carbon that should not be flexed, and few routing paths. It is a slower job than a saloon and we price the time honestly. Nothing is cut or drilled and the work is reversible."),
       ("Will the factory audio and camera stay?",
        "Yes. The factory display and controls, steering-wheel switches, the reversing camera where one is fitted and the audio system all continue to work as standard.")]),

"mclaren": dict(
 name="McLaren", file="mclaren-apple-carplay-london",
 sysline="the IRIS system in the MP4-12C, 650S, 570S and 675LT, and the newer 720S and Artura units",
 intro="McLaren's IRIS infotainment has a reputation among owners, and it is deserved - the MP4-12C, 650S, 570S and 675LT shipped with a system that was slow and awkward when the cars were new. It is the single most common non-mechanical complaint we hear about these cars, and adding CarPlay to the portrait display transforms daily usability. The 720S and Artura systems are much improved, so what is worth doing depends on which generation you have.",
 how="On the IRIS cars we feed the factory portrait display through an interface behind the unit, keeping the original controls, so navigation and music become usable without any change to the cabin. The constraint is the carbon monocoque: the routing paths that exist on a conventional car largely do not, nothing is drilled, and nothing is clamped to structure. It is the most access-constrained infotainment work we do and we price the extra time rather than pretending otherwise.",
 keeps="The factory portrait display, the original controls, steering-wheel switches, reversing camera and the factory or Bowers &amp; Wilkins audio are all retained, and the installation leaves no trace.",
 faqs=[("Can you fix the IRIS system in my 650S or 570S?",
        "We can make it usable, which is what owners actually want. Feeding the factory portrait display with CarPlay means navigation and music come from your phone instead of from IRIS, without changing anything about the cabin. It is the most common request we get on these cars."),
       ("Does the carbon tub make this harder?",
        "Yes - the routing paths a conventional car offers largely do not exist, nothing is drilled and nothing is clamped to structure. It is the most access-constrained infotainment job we do, and we price the extra time rather than pretending it is the same as a saloon."),
       ("Is it worth doing on a 720S?",
        "Less obviously. The 720S and Artura systems are much improved over IRIS, so the gain is smaller. We would rather tell you that than take the work - it depends on which generation you have and how you use the car.")]),
}

SOFTWARE = {
"bmw-idrive-reboot": dict(
 name="BMW iDrive",
 intro="A frozen, black or boot-looping iDrive is one of the most common non-mechanical faults on a modern BMW, and it very rarely needs the replacement head unit a dealer will quote for. Most of what we see is software: a corrupted map update, an interrupted flash, a failed FSC code, or a unit that has been running on a battery too weak to complete a boot cycle. The fault presents as hardware and usually is not.",
 body="Diagnosis comes first and it is not guesswork. We read the fault memory across the relevant modules with dealer-level equipment, check the voltage the unit is actually seeing, and establish whether the head unit is failing to boot or booting and then losing communication - two different problems with two different fixes. From there the work is a controlled reboot, a software recovery, or a reflash of the unit's operating software. Where a unit has genuinely failed we say so and quote a repair or replacement rather than charging for attempts that will not work.",
 note="Voltage is the single most common contributing factor we find, and it is the one owners are most surprised by. A head unit that is asked to boot on a tired battery, or during a flash procedure that pulls current for twenty minutes, will corrupt its own software. If your battery is marginal we will tell you before we start - fixing the software without fixing the supply means you will be calling us again.",
 faqs=[("Does a frozen iDrive mean a new head unit?",
        "Usually not. Most of what we see is software - a corrupted map update, an interrupted flash, a failed FSC code, or a unit that tried to boot on a weak battery. We diagnose before quoting, and where the unit has genuinely failed we say so rather than charging for attempts that will not work."),
       ("Why do you keep asking about my battery?",
        "Because it is the most common contributing factor we find. A head unit asked to boot on a tired battery, or to hold up through a twenty-minute flash, can corrupt its own software. Fixing the software without fixing the supply means the fault comes back."),
       ("Can this be done at my address?",
        "Yes - most iDrive work is mobile. We bring dealer-level equipment and our own power supply, so a diagnosis and a software recovery happen at your home or office. Only a genuine hardware failure needs the unit to go away.")]),

"mini-idrive-reboot": dict(
 name="MINI Connected",
 intro="MINI Connected runs on BMW's infotainment platforms, so the faults are familiar - black screens, boot loops, a display stuck on the logo, Bluetooth or CarPlay that has stopped being offered. What differs is the car. An F55 or F56 dash is tightly packed and the circular centre display sits in a trim ring that shows any rough handling, so where a job does need the unit out, it is a more delicate proposition than the equivalent BMW.",
 body="We diagnose with the same dealer-level equipment we use on BMW, reading fault memory across the modules and checking what voltage the unit is seeing before touching anything. The great majority of MINI cases are resolved without removing the head unit at all: a controlled reboot, a software recovery, or a reflash of the operating software. Where the unit does have to come out, the centre display and its trim ring are released properly rather than persuaded - that is the main practical difference from doing this work on a 3 Series.",
 note="MINIs come to us disproportionately after a failed or interrupted software update, often one attempted over a weak battery or a poor connection. If yours stopped responding during an update, say so when you book - it tells us where to start and it usually shortens the job considerably.",
 faqs=[("Is a MINI the same job as a BMW iDrive fault?",
        "The platform is the same, so the diagnosis and the software work are familiar. The car is not: an F55 or F56 dash is tightly packed and the circular display sits in a trim ring that shows rough handling. Where the unit has to come out it is a more delicate job than the equivalent BMW."),
       ("It stopped working during a software update. Is that recoverable?",
        "Usually yes, and it is one of the most common reasons MINIs come to us - often an update attempted over a weak battery or a poor connection. Tell us that when you book, because it tells us where to start and normally shortens the job."),
       ("Do you need to take the screen out?",
        "In most cases no. The majority of MINI faults are resolved with a controlled reboot, a software recovery or a reflash, with nothing removed. We would rather not disturb the trim ring if the fault does not require it.")]),

"bmw-mini-coding-programming": dict(
 name="BMW and MINI coding",
 intro="Coding is not repair work - it is changing what your car does with capability it already has. On BMW and MINI that covers a long list: enabling Apple CarPlay where the hardware is present, setting CarPlay to fullscreen rather than split-screen, video in motion, folding mirrors on lock, cornering lights, digital speed display, comfort access behaviour, start-stop defaults and the sport displays. None of it adds hardware, and all of it is reversible.",
 body="We work with dealer-level tooling and we back up before we change anything - the original coding data is saved so the car can be returned to exactly how it left the factory if you ever want that, or if a dealer asks. Requests are handled one at a time and tested as we go rather than flashed in a batch and hoped over. If something you have asked for is not available on your car's specific build, we tell you before we take payment for it, because build date matters more than model year on these platforms.",
 note="One honest caveat: some coding changes are legal in one context and not in another. Video in motion is the obvious example - we will code it, and it is your responsibility how it is used. Anything that affects lighting or emissions behaviour we will discuss with you rather than simply doing, because a car has to remain roadworthy and insurable and that matters more than a feature list.",
 faqs=[("Is coding reversible?",
        "Yes. We back up the original coding data before changing anything, so the car can be returned to exactly its factory configuration - whether that is because you changed your mind or because a dealer has asked. Nothing we code adds hardware."),
       ("Can you code anything I ask for?",
        "Only what your specific car supports, and build date matters more than model year on these platforms. If something on your list is not available on your build we tell you before taking payment rather than after. We will also flag anything that affects lighting or emissions behaviour and discuss it rather than simply doing it."),
       ("What do people most often ask for?",
        "Fullscreen CarPlay instead of split-screen, video in motion, mirrors that fold on lock, cornering lights, a digital speed display and the sport displays. Enabling CarPlay itself where the hardware is already present is the single most common request.")]),

"bmw-mini-software-recovery": dict(
 name="BMW and MINI software recovery",
 intro="Software recovery is what is needed when a programming operation has gone wrong: an update that stopped part-way, a flash interrupted by a dropped battery, a module left in an incomplete state, a car that will not start after work was done elsewhere. It is a different job from a frozen screen and a much more serious one, because an incompletely flashed control module can leave a car undriveable rather than merely annoying.",
 body="The first job is establishing what state each module is actually in, which means reading across the vehicle rather than looking only at the one that failed. From there we reflash the affected modules in the correct order with a stable supply - and the supply is the part most often missing when this goes wrong in the first place. We use a mains-backed power source throughout rather than relying on the car's battery, because a second interruption during recovery makes the situation materially worse.",
 note="If another garage or a mobile coder has attempted work and left the car in this state, tell us what was tried. We are not interested in apportioning blame, but knowing which modules were touched and with what tooling genuinely shortens the recovery and reduces what it costs you. Guessing is the expensive way to do this.",
 faqs=[("My car will not start after someone else coded it. Can you recover it?",
        "Usually, yes - that is what this work is. We read across every module rather than only the one that failed, establish what state each is in, then reflash in the correct order on a stable mains-backed supply. Tell us what was attempted and with what tooling; it genuinely shortens the job."),
       ("How is this different from an iDrive reboot?",
        "An iDrive fault is an annoyance - a screen that will not behave. A failed flash can leave a control module incomplete and the car undriveable. It is a more serious job, it needs reading across the whole vehicle, and it needs a guaranteed power supply throughout."),
       ("Why does the power supply matter so much?",
        "Because an interruption is what caused the problem in most of these cases. We run a mains-backed supply throughout rather than trusting the car's battery - a second interruption during recovery makes the situation considerably worse, and that risk is not worth taking.")]),
}
