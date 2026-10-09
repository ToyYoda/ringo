package de.hochzeitsapp

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import de.hochzeitsapp.data.ProgramStatus
import de.hochzeitsapp.ui.AppViewModel
import de.hochzeitsapp.ui.UiState
import de.hochzeitsapp.ui.components.LocalOpenDrawer
import de.hochzeitsapp.ui.screens.*
import de.hochzeitsapp.ui.theme.HochzeitsTheme
import de.hochzeitsapp.ui.theme.Script
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            HochzeitsTheme {
                val vm: AppViewModel = viewModel()
                val ui by vm.state.collectAsStateWithLifecycle()
                Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                    if (ui.session == null || ui.wedding == null) EntryFlow(ui, vm) else MainApp(ui, vm)
                }
            }
        }
    }
}

@Composable
private fun EntryFlow(ui: UiState, vm: AppViewModel) {
    var setup by rememberSaveable { mutableStateOf(false) }
    BackHandler(enabled = setup) { setup = false }
    if (setup) SetupScreen(ui, vm, onDone = { setup = false }, onCancel = { setup = false })
    else WelcomeScreen(ui, vm, onSetup = { setup = true })
}

private data class MenuEntry(val route: String, val label: String, val icon: ImageVector, val badge: Int = 0)

@Composable
private fun MainApp(ui: UiState, vm: AppViewModel) {
    val nav = rememberNavController()
    val drawer = rememberDrawerState(DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    val current = nav.currentBackStackEntryAsState().value?.destination?.route
    val w = ui.wedding!!

    val pendingProgram = if (ui.canOrganize) w.program.count { it.status == ProgramStatus.REQUESTED && !(ui.isCouple && it.surprise) } else 0
    val pendingPhotos = if (ui.isCouple) w.photos.count { !it.approved || it.reported } else 0

    val main = listOf(
        MenuEntry("home", "Startseite", Icons.Default.Home),
        MenuEntry("details", "Details", Icons.Default.Info),
        MenuEntry("events", "Termine", Icons.Default.CalendarMonth),
        MenuEntry("program", "Programm", Icons.Default.Schedule, pendingProgram),
        MenuEntry("gallery", "Fotogalerie", Icons.Default.PhotoLibrary, pendingPhotos),
        MenuEntry("timeline", "Pinnwand", Icons.AutoMirrored.Filled.Chat),
        MenuEntry("guests", "Gäste", Icons.Default.People),
        MenuEntry("gifts", "Geschenke", Icons.Default.CardGiftcard),
    )
    val extra = buildList {
        add(MenuEntry("groups", "Gruppen", Icons.Default.Diversity3))
        if (ui.isCouple) add(MenuEntry("planning", "Planung", Icons.Default.Checklist))
        add(MenuEntry("tips", "Tipps", Icons.Default.Lightbulb))
        add(MenuEntry("settings", "Einstellungen", Icons.Default.Settings))
    }

    fun go(route: String) {
        scope.launch { drawer.close() }
        nav.navigate(route) {
            popUpTo("home") { saveState = true }
            launchSingleTop = true
            restoreState = true
        }
    }

    ModalNavigationDrawer(
        drawerState = drawer,
        drawerContent = {
            ModalDrawerSheet(Modifier.width(300.dp)) {
                Column(Modifier.verticalScroll(rememberScrollState())) {
                    Column(Modifier.padding(start = 24.dp, top = 24.dp, bottom = 12.dp)) {
                        Text(w.profile.coupleNames, fontFamily = Script, fontSize = 32.sp, color = MaterialTheme.colorScheme.primary)
                        Text(if (ui.isCouple) "Brautpaar" else "${ui.myName} · ${ui.me?.role?.label ?: "Gast"}", style = MaterialTheme.typography.bodySmall)
                    }
                    main.forEach { DrawerItem(it, current == it.route) { go(it.route) } }
                    HorizontalDivider(Modifier.padding(vertical = 8.dp, horizontal = 24.dp))
                    Text("GRUPPEN & MEHR", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.secondary, modifier = Modifier.padding(start = 28.dp, bottom = 4.dp))
                    extra.forEach { DrawerItem(it, current == it.route) { go(it.route) } }
                    Spacer(Modifier.height(16.dp))
                }
            }
        },
    ) {
        CompositionLocalProvider(LocalOpenDrawer provides { scope.launch { drawer.open() } }) {
            AppNavHost(nav, ui, vm)
        }
    }
}

@Composable
private fun DrawerItem(e: MenuEntry, selected: Boolean, onClick: () -> Unit) {
    NavigationDrawerItem(
        label = { Text(e.label) },
        icon = { Icon(e.icon, null) },
        selected = selected,
        onClick = onClick,
        badge = if (e.badge > 0) ({ Badge { Text("${e.badge}") } }) else null,
        modifier = Modifier.padding(horizontal = 12.dp),
    )
}

@Composable
private fun AppNavHost(nav: NavHostController, ui: UiState, vm: AppViewModel) {
    val navigate: (String) -> Unit = { nav.navigate(it) { launchSingleTop = true } }
    val back: () -> Unit = { nav.popBackStack() }
    NavHost(nav, startDestination = "home") {
        composable("home") { HomeScreen(ui, vm, navigate) }
        composable("details") { DetailsScreen(ui, vm, navigate) }
        composable("events") { EventsScreen(ui, vm) }
        composable("program") { ProgramScreen(ui, vm) }
        composable("gallery") { GalleryScreen(ui, vm, navigate) }
        composable("photo/{id}") { PhotoDetailScreen(ui, vm, it.arguments?.getString("id").orEmpty(), back) }
        composable("timeline") { TimelineScreen(ui, vm) }
        composable("guests") { GuestsScreen(ui, vm, navigate) }
        composable("guest/{id}") { GuestDetailScreen(ui, vm, it.arguments?.getString("id").orEmpty(), back) }
        composable("gifts") { GiftsScreen(ui, vm, navigate) }
        composable("groups") { GroupsScreen(ui, vm, navigate) }
        composable("group/{id}") { GroupDetailScreen(ui, vm, it.arguments?.getString("id").orEmpty(), back) }
        composable("planning") { if (ui.isCouple) PlanningScreen(ui, vm) else HomeScreen(ui, vm, navigate) }
        composable("tips") { TipsScreen(ui) }
        composable("settings") { SettingsScreen(ui, vm, onLoggedOut = {}) }
    }
}
