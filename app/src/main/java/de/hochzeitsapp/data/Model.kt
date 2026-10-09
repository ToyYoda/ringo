package de.hochzeitsapp.data

import kotlinx.serialization.Serializable
import java.util.UUID

fun newId(): String = UUID.randomUUID().toString().take(8)

@Serializable
data class Person(
    val firstName: String = "",
    val lastName: String = "",
    val birthDate: String = "",
    val city: String = "",
    val street: String = "",
    val phone: String = "",
    val mail: String = "",
)

/** Standesamt, Kirche, Feier … – die Eckdaten auf der Detailseite. */
@Serializable
data class Venue(
    val id: String = newId(),
    val title: String,
    val place: String = "",
    val date: String = "",
    val time: String = "",
)

@Serializable
data class WeddingProfile(
    val motto: String = "",
    val bride: Person = Person(),
    val groom: Person = Person(),
    val headline: String = "",
    val subline: String = "",
    val introText: String = "",
    /** „So möchten wir unsere Hochzeit feiern“ */
    val celebrationText: String = "",
    val coverPhoto: String? = null,
    val venues: List<Venue> = emptyList(),
    /** Eigene Erklärung: Hotels, Parken, Ansprechpartner, weitere Teilveranstaltungen … */
    val infoText: String = "",
    /** Date the invitations become official; guests are notified from then on. */
    val invitationDate: String = "",
    val passwordHash: String = "",
    /** Gästefotos müssen vom Brautpaar freigegeben werden. */
    val moderatePhotos: Boolean = true,
) {
    val coupleNames: String
        get() = listOf(bride.firstName, groom.firstName).filter { it.isNotBlank() }.joinToString(" & ")
}

@Serializable
enum class Side(val label: String) { BRIDE("Braut"), GROOM("Bräutigam"), BOTH("Beide") }

@Serializable
enum class Relation(val label: String) { FAMILY("Familie"), FRIEND("Freund/in"), COLLEAGUE("Kollege/in"), OTHER("Sonstiges") }

@Serializable
enum class GuestRole(val label: String) { GUEST("Gast"), WITNESS("Trauzeuge/in"), ORGANIZER("Organisator/in") }

@Serializable
enum class Rsvp(val label: String) { OPEN("Offen"), YES("Zugesagt"), NO("Abgesagt") }

@Serializable
data class Guest(
    val id: String = newId(),
    val firstName: String,
    val lastName: String = "",
    val city: String = "",
    val mail: String = "",
    val photo: String? = null,
    val side: Side = Side.BOTH,
    val relation: Relation = Relation.FRIEND,
    val role: GuestRole = GuestRole.GUEST,
    val partner: String = "",
    /** Woher kennt ihr euch? */
    val howWeMet: String = "",
    val wish: String = "",
    val invitedEventIds: List<String> = emptyList(),
    val rsvp: Map<String, Rsvp> = emptyMap(),
    val needsAccommodation: Boolean = false,
    val inviteCode: String = newId().take(6).uppercase(),
) {
    val fullName: String get() = "$firstName $lastName".trim()
    val canOrganize: Boolean get() = role != GuestRole.GUEST
}

/** A dated entry in the Terminliste, e.g. Polterabend, Trauung, Feier. */
@Serializable
data class WeddingEvent(
    val id: String = newId(),
    val title: String,
    val date: String,
    val time: String = "",
    val place: String = "",
    val notes: String = "",
)

@Serializable
enum class ProgramStatus(val label: String) { REQUESTED("Angefragt"), CONFIRMED("Bestätigt"), DECLINED("Abgelehnt") }

/** Programmpunkt in der Abendplanung (z. B. Rede, Spiel, Diashow). */
@Serializable
data class ProgramItem(
    val id: String = newId(),
    val eventId: String,
    val title: String,
    val time: String = "",
    val durationMin: Int = 15,
    val host: String = "",
    val hostGuestId: String? = null,
    val notes: String = "",
    /** Hinweise an den Veranstalter (Technik, Beamer …). */
    val requirements: String = "",
    /** Überraschung: nur für Organisatoren sichtbar, nicht für das Brautpaar. */
    val surprise: Boolean = false,
    val status: ProgramStatus = ProgramStatus.REQUESTED,
)

@Serializable
data class Comment(
    val id: String = newId(),
    val authorName: String,
    val text: String,
    val timestamp: Long = System.currentTimeMillis(),
)

@Serializable
data class Photo(
    val id: String = newId(),
    val uri: String,
    val caption: String = "",
    val category: String = "Allgemein",
    val authorName: String,
    val authorId: String? = null,
    val timestamp: Long = System.currentTimeMillis(),
    val approved: Boolean = true,
    val likedBy: List<String> = emptyList(),
    val comments: List<Comment> = emptyList(),
    val reported: Boolean = false,
)

/** Beitrag auf der Pinnwand / Timeline oder in einer Gruppe. */
@Serializable
data class Post(
    val id: String = newId(),
    val groupId: String? = null,
    val authorName: String,
    val authorId: String? = null,
    val text: String,
    val photo: String? = null,
    val timestamp: Long = System.currentTimeMillis(),
    val likedBy: List<String> = emptyList(),
    val comments: List<Comment> = emptyList(),
)

@Serializable
data class Gift(
    val id: String = newId(),
    val title: String,
    val description: String = "",
    val link: String = "",
    val price: String = "",
    /** Wer reserviert hat, bleibt anonym – sichtbar ist nur „wird schon geschenkt“. */
    val reservedBy: String? = null,
) {
    val reserved: Boolean get() = reservedBy != null
}

@Serializable
data class Group(
    val id: String = newId(),
    val title: String,
    val description: String = "",
    val creatorName: String,
    val creatorId: String? = null,
    val memberIds: List<String> = emptyList(),
    /** Gruppengeschenk: Zielbetrag, Beiträge der Mitglieder, Zahlungsinfos. */
    val isGiftGroup: Boolean = false,
    val giftId: String? = null,
    val targetAmount: Double = 0.0,
    val contributions: Map<String, Double> = emptyMap(),
    val deadline: String = "",
    val paymentInfo: String = "",
    /** Überraschungsgruppe: für das Brautpaar ausgeblendet. */
    val hiddenFromCouple: Boolean = false,
) {
    val collected: Double get() = contributions.values.sum()
}

@Serializable
data class ChecklistItem(
    val id: String = newId(),
    val phase: String,
    val text: String,
    val done: Boolean = false,
)

@Serializable
data class Wedding(
    val profile: WeddingProfile = WeddingProfile(),
    val guests: List<Guest> = emptyList(),
    val events: List<WeddingEvent> = emptyList(),
    val program: List<ProgramItem> = emptyList(),
    val photos: List<Photo> = emptyList(),
    val posts: List<Post> = emptyList(),
    val gifts: List<Gift> = emptyList(),
    val groups: List<Group> = emptyList(),
    val checklist: List<ChecklistItem> = emptyList(),
    val photoCategories: List<String> = listOf("Allgemein", "Vorbereitung", "Trauung", "Feier"),
)

/** Wer gerade angemeldet ist: das Brautpaar (Verwaltung) oder ein Gast. */
@Serializable
sealed interface Session {
    @Serializable
    data object Couple : Session

    @Serializable
    data class AsGuest(val guestId: String) : Session
}

@Serializable
data class AppData(
    val wedding: Wedding? = null,
    val isDemo: Boolean = false,
    val session: Session? = null,
)
