package de.hochzeitsapp.data

import java.util.concurrent.TimeUnit

/** Demo-Hochzeit nach den Papierentwürfen: „Claudia & Karl“. */
object DemoData {

    private fun hoursAgo(h: Long) = System.currentTimeMillis() - TimeUnit.HOURS.toMillis(h)

    fun wedding(): Wedding {
        val polterabend = WeddingEvent(id = "ev-polter", title = "Polterabend", date = "12.06.2027", time = "19:00", place = "Garten der Familie Berger, Lindenweg 4, Heidelberg")
        val standesamt = WeddingEvent(id = "ev-standesamt", title = "Standesamtliche Trauung", date = "13.06.2027", time = "11:00", place = "Rathaus Heidelberg, Marktplatz 10")
        val kirche = WeddingEvent(id = "ev-kirche", title = "Kirchliche Trauung", date = "13.06.2027", time = "14:30", place = "Peterskirche, Plöck 70, Heidelberg")
        val feier = WeddingEvent(id = "ev-feier", title = "Hochzeitsfeier", date = "13.06.2027", time = "18:00", place = "Gut Neuhof, Neuhofer Str. 1, Heidelberg", notes = "Dresscode: festlich. Shuttlebus ab Kirche um 17:15.")
        val brunch = WeddingEvent(id = "ev-brunch", title = "Katerfrühstück", date = "14.06.2027", time = "11:00", place = "Gut Neuhof")
        val events = listOf(polterabend, standesamt, kirche, feier, brunch)
        val allIds = events.map { it.id }
        val noStandesamt = allIds - standesamt.id

        val guests = listOf(
            Guest(id = "g-anna", firstName = "Anna", lastName = "Berger", city = "Heidelberg", side = Side.BRIDE, relation = Relation.FAMILY, role = GuestRole.WITNESS, partner = "Tom Berger", howWeMet = "Schwester der Braut", wish = "Dass ihr euch nie das Lachen nehmen lasst!", invitedEventIds = allIds, rsvp = allIds.associateWith { Rsvp.YES }, inviteCode = "ANNA01"),
            Guest(id = "g-tom", firstName = "Tom", lastName = "Berger", city = "Heidelberg", side = Side.BRIDE, relation = Relation.FAMILY, partner = "Anna Berger", howWeMet = "Schwager", invitedEventIds = allIds, rsvp = allIds.associateWith { Rsvp.YES }, inviteCode = "TOM002"),
            Guest(id = "g-felix", firstName = "Felix", lastName = "Hartmann", city = "Mannheim", side = Side.GROOM, relation = Relation.FRIEND, role = GuestRole.WITNESS, howWeMet = "Studienfreund von Karl – seit dem ersten Semester unzertrennlich", wish = "Viele Abenteuer zu zweit!", invitedEventIds = allIds, rsvp = mapOf(polterabend.id to Rsvp.YES, standesamt.id to Rsvp.YES, kirche.id to Rsvp.YES, feier.id to Rsvp.YES, brunch.id to Rsvp.OPEN), inviteCode = "FELIX3"),
            Guest(id = "g-maria", firstName = "Maria", lastName = "Schulz", city = "Köln", side = Side.GROOM, relation = Relation.FAMILY, howWeMet = "Tante von Karl", invitedEventIds = noStandesamt, rsvp = mapOf(kirche.id to Rsvp.YES, feier.id to Rsvp.YES, polterabend.id to Rsvp.NO), needsAccommodation = true, inviteCode = "MARIA4"),
            Guest(id = "g-lena", firstName = "Lena", lastName = "Wolf", city = "Berlin", side = Side.BRIDE, relation = Relation.FRIEND, role = GuestRole.ORGANIZER, partner = "Single", howWeMet = "Beste Freundin aus der Schulzeit", wish = "Tanzt bis zum Morgengrauen!", invitedEventIds = noStandesamt, rsvp = mapOf(kirche.id to Rsvp.YES, feier.id to Rsvp.YES), needsAccommodation = true, inviteCode = "LENA05"),
            Guest(id = "g-jonas", firstName = "Jonas", lastName = "Klein", city = "Stuttgart", side = Side.GROOM, relation = Relation.COLLEAGUE, howWeMet = "Arbeitskollege bei Karl", invitedEventIds = listOf(feier.id), inviteCode = "JONAS6"),
            Guest(id = "g-sophie", firstName = "Sophie", lastName = "Neumann", city = "Heidelberg", side = Side.BOTH, relation = Relation.FRIEND, howWeMet = "Nachbarin – hat die beiden einander vorgestellt", invitedEventIds = noStandesamt, rsvp = mapOf(kirche.id to Rsvp.YES, feier.id to Rsvp.NO, polterabend.id to Rsvp.YES), inviteCode = "SOPHI7"),
        )

        val gifts = listOf(
            Gift(id = "gift-kitchen", title = "Küchenmaschine", description = "Für Karls legendäre Hefezöpfe", price = "ca. 450 €", link = "https://www.amazon.de/s?k=k%C3%BCchenmaschine"),
            Gift(id = "gift-trip", title = "Zuschuss Hochzeitsreise", description = "Wir träumen von zwei Wochen Portugal", price = "beliebig"),
            Gift(id = "gift-dishes", title = "Geschirrset für 8 Personen", description = "Weiß, schlicht – damit wir euch alle einladen können", price = "ca. 180 €", reservedBy = "g-maria"),
            Gift(id = "gift-plant", title = "Olivenbaum für den Balkon", price = "ca. 90 €"),
            Gift(id = "gift-cinema", title = "Kino-Gutschein", price = "ca. 30 €"),
        )

        val groups = listOf(
            Group(
                id = "grp-reise", title = "Gemeinsam: Hochzeitsreise", description = "Wir legen zusammen für die Portugal-Reise. Bitte tragt ein, wie viel ihr geben möchtet.",
                creatorName = "Anna Berger", creatorId = "g-anna", memberIds = listOf("g-anna", "g-tom", "g-lena", "g-sophie"),
                isGiftGroup = true, giftId = "gift-trip", targetAmount = 1200.0,
                contributions = mapOf("g-anna" to 200.0, "g-tom" to 200.0, "g-lena" to 150.0),
                deadline = "01.05.2027", paymentInfo = "Überweisung an Anna Berger, IBAN folgt per Mail",
            ),
            Group(
                id = "grp-film", title = "Überraschungsfilm", description = "Wir drehen ein kurzes Video mit Grüßen aller Gäste. Pssst – geheim!",
                creatorName = "Felix Hartmann", creatorId = "g-felix", memberIds = listOf("g-felix", "g-lena", "g-jonas"),
                hiddenFromCouple = true,
            ),
        )

        val posts = listOf(
            Post(authorName = "Claudia & Karl", text = "Die Einladungen sind raus! 💌 Wir freuen uns riesig auf euch. Alle Infos findet ihr unter „Details“.", timestamp = hoursAgo(72)),
            Post(authorName = "Anna Berger", authorId = "g-anna", text = "Probeessen auf Gut Neuhof – ich sag nur: der Nachtisch! 😋", photo = "demo:dessert", timestamp = hoursAgo(30), likedBy = listOf("g-lena", "couple")),
            Post(authorName = "Felix Hartmann", authorId = "g-felix", groupId = "grp-film", text = "Drehtermin für alle: Samstag 15 Uhr bei mir. Bringt gute Laune mit!", timestamp = hoursAgo(20)),
            Post(authorName = "Lena Wolf", authorId = "g-lena", groupId = "grp-reise", text = "Ich habe meinen Anteil überwiesen ✔", timestamp = hoursAgo(6)),
        )

        val photos = listOf(
            Photo(id = "ph1", uri = "demo:rings", caption = "Die Ringe sind da!", category = "Vorbereitung", authorName = "Claudia & Karl", likedBy = listOf("g-anna", "g-lena"), comments = listOf(Comment(authorName = "Anna Berger", text = "Wunderschön! 💍")), timestamp = hoursAgo(90)),
            Photo(id = "ph2", uri = "demo:location", caption = "Gut Neuhof im Frühling", category = "Vorbereitung", authorName = "Claudia & Karl", timestamp = hoursAgo(80)),
            Photo(id = "ph3", uri = "demo:dessert", caption = "Probeessen", category = "Vorbereitung", authorName = "Anna Berger", authorId = "g-anna", timestamp = hoursAgo(30)),
            Photo(id = "ph4", uri = "demo:flowers", caption = "Brautstrauß-Inspiration", category = "Vorbereitung", authorName = "Lena Wolf", authorId = "g-lena", timestamp = hoursAgo(12)),
            Photo(id = "ph5", uri = "demo:couple", caption = "Verlobung am See", category = "Allgemein", authorName = "Claudia & Karl", timestamp = hoursAgo(200)),
            Photo(id = "ph6", uri = "demo:cake", caption = "Tortenauswahl", category = "Vorbereitung", authorName = "Felix Hartmann", authorId = "g-felix", approved = false, timestamp = hoursAgo(2)),
        )

        val program = listOf(
            ProgramItem(eventId = feier.id, title = "Sektempfang", time = "18:00", durationMin = 60, host = "Brautpaar", status = ProgramStatus.CONFIRMED),
            ProgramItem(eventId = feier.id, title = "Begrüßung & Rede der Brauteltern", time = "19:00", durationMin = 15, host = "Familie Berger", status = ProgramStatus.CONFIRMED),
            ProgramItem(eventId = feier.id, title = "Abendessen", time = "19:15", durationMin = 90, host = "Gut Neuhof", status = ProgramStatus.CONFIRMED),
            ProgramItem(eventId = feier.id, title = "Diashow „Wie alles begann“", time = "20:45", durationMin = 20, host = "Anna Berger", hostGuestId = "g-anna", requirements = "Beamer + Leinwand", status = ProgramStatus.CONFIRMED),
            ProgramItem(eventId = feier.id, title = "Überraschungsfilm der Freunde", time = "21:15", durationMin = 10, host = "Felix Hartmann", hostGuestId = "g-felix", requirements = "Beamer, Ton", surprise = true, status = ProgramStatus.CONFIRMED),
            ProgramItem(eventId = feier.id, title = "Spiel: Wer kennt das Brautpaar besser?", time = "21:30", durationMin = 30, host = "Lena Wolf", hostGuestId = "g-lena", status = ProgramStatus.REQUESTED),
            ProgramItem(eventId = feier.id, title = "Eröffnungstanz", time = "22:00", durationMin = 10, host = "Brautpaar", status = ProgramStatus.CONFIRMED),
            ProgramItem(eventId = polterabend.id, title = "Porzellan zerdeppern", time = "19:30", durationMin = 30, host = "alle", status = ProgramStatus.CONFIRMED),
        )

        return Wedding(
            profile = WeddingProfile(
                motto = "Zwei Herzen, ein Weg",
                bride = Person(firstName = "Claudia", lastName = "Berger", city = "Heidelberg", mail = "claudia@example.com"),
                groom = Person(firstName = "Karl", lastName = "Schulz", city = "Heidelberg", mail = "karl@example.com"),
                headline = "Wir heiraten!",
                subline = "13. Juni 2027 · Heidelberg",
                introText = "Nach acht Jahren, zwei Umzügen und einem sehr eigenwilligen Kater wagen wir den nächsten Schritt. Hier findet ihr alles rund um unsere Hochzeit – Termine, Programm, Geschenke und natürlich die Fotos.",
                celebrationText = "Wir wünschen uns ein entspanntes Fest mit allen, die uns wichtig sind: Trauung in der Peterskirche, danach feiern wir auf Gut Neuhof bis in die Morgenstunden. Ihr wollt etwas zum Abend beitragen? Meldet euren Programmpunkt einfach unter „Programm“ an!",
                venues = listOf(
                    Venue(title = "Standesamtlich", place = standesamt.place, date = standesamt.date, time = standesamt.time),
                    Venue(title = "Kirchlich", place = kirche.place, date = kirche.date, time = kirche.time),
                    Venue(title = "Feier", place = feier.place, date = feier.date, time = feier.time),
                ),
                infoText = """
                    Hotelempfehlungen: Im Hotel Neuhof haben wir ein Zimmerkontingent unter dem Stichwort „Berger-Schulz“ reserviert (bis 01.04.2027).

                    Parken: Direkt am Gut gibt es ausreichend Parkplätze. An der Peterskirche wird es eng – bitte nutzt das Parkhaus Kornmarkt.

                    Ansprechpartner: Für alle Fragen und Überraschungen meldet euch bei unseren Trauzeugen Anna (Braut) und Felix (Bräutigam).

                    Weitere Veranstaltungen: Polterabend am Vorabend, Katerfrühstück am Sonntag.
                """.trimIndent(),
                invitationDate = "01.12.2026",
                passwordHash = Security.hash("demo"),
            ),
            guests = guests,
            events = events,
            program = program,
            photos = photos,
            posts = posts,
            gifts = gifts,
            groups = groups,
            checklist = defaultChecklist().mapIndexed { i, item -> if (i < 9) item.copy(done = true) else item },
        )
    }

    fun defaultChecklist(): List<ChecklistItem> = listOf(
        "12 Monate vorher" to listOf("Budget festlegen", "Termin & grobe Gästezahl festlegen", "Location besichtigen und buchen", "Trauzeugen fragen"),
        "9 Monate vorher" to listOf("Fotograf buchen", "Band oder DJ buchen", "Save-the-Date verschicken", "Hotelkontingent für Gäste reservieren"),
        "6 Monate vorher" to listOf("Brautkleid & Anzug aussuchen", "Einladungen verschicken", "Geschenkeliste anlegen", "Trauringe aussuchen"),
        "3 Monate vorher" to listOf("Termin beim Standesamt", "Traugespräch mit Pfarrer/Redner", "Menü & Torte festlegen", "Blumenschmuck bestellen"),
        "1 Monat vorher" to listOf("Sitzordnung planen", "Programmablauf finalisieren", "Rückmeldungen nachfassen", "Ehe-Notfallkoffer packen"),
        "Nach der Hochzeit" to listOf("Fotos in der Galerie teilen", "Dankeskarten verschicken", "Namensänderung erledigen"),
    ).flatMap { (phase, items) -> items.map { ChecklistItem(phase = phase, text = it) } }
}

data class Tip(val title: String, val text: String, val link: String? = null)

/** Inhalte für „Tipps zur Durchführung“ und die Planungsbereiche des Brautpaars. */
object Tips {
    val programIdeas = listOf(
        Tip("Wer kennt das Brautpaar besser?", "Fragen über das Paar – Familie gegen Freunde. Braucht nur Karten und einen Moderator."),
        Tip("Hochzeits-Bingo", "Bingo-Karten mit typischen Momenten (\"Onkel tanzt auf dem Tisch\"). Läuft den ganzen Abend nebenher."),
        Tip("Diashow „Wie alles begann“", "Kinderfotos und gemeinsame Bilder. Beamer und Leinwand rechtzeitig mit der Location klären."),
        Tip("Schuhspiel", "Brautpaar sitzt Rücken an Rücken und beantwortet Fragen mit dem Schuh des Partners oder dem eigenen."),
        Tip("Gästebuch mit Sofortbildkamera", "Gäste fotografieren sich und kleben das Foto mit einem Wunsch ins Buch."),
        Tip("Luftballon- oder Laternenstart", "Wünsche an Karten befestigen. Vorab Genehmigung und Umweltverträglichkeit prüfen!"),
    )

    val vendorCategories = listOf(
        "Fotografen" to "Hochzeitsfotograf",
        "Hotels" to "Hotel",
        "Floristen" to "Florist Hochzeit",
        "Locations" to "Hochzeitslocation",
        "DJs & Bands" to "Hochzeit DJ",
        "Konditoreien" to "Hochzeitstorte Konditorei",
        "Brautmode" to "Brautmode",
        "Trauredner" to "freier Trauredner",
    )

    val guestTips = listOf(
        "Rund um die Feier" to listOf(
            Tip("Programmpunkt anmelden", "Ihr wollt eine Rede halten oder ein Spiel machen? Unter „Programm“ anmelden – das Brautpaar oder die Trauzeugen bestätigen es, dann weiß jeder Bescheid."),
            Tip("Überraschungen", "Programmpunkte können als Überraschung markiert werden. Sie sind dann nur für Organisatoren sichtbar."),
            Tip("Gruppengeschenke", "Größere Wünsche von der Geschenkeliste lassen sich über eine Gruppe gemeinsam finanzieren."),
        ),
        "Fotos" to listOf(
            Tip("Fotos hochladen", "In der Galerie direkt mit der Kamera fotografieren oder Bilder aus dem Handy auswählen."),
            Tip("Freigabe", "Je nach Einstellung gibt das Brautpaar neue Fotos frei, bevor alle sie sehen."),
        ),
        "Links" to listOf(
            Tip("Knigge für Hochzeitsgäste", "Was ziehe ich an, wie viel schenke ich?", "https://www.google.com/search?q=knigge+hochzeitsgast"),
            Tip("Rede schreiben", "Tipps für eine gelungene Hochzeitsrede", "https://www.google.com/search?q=hochzeitsrede+tipps"),
        ),
    )
}
