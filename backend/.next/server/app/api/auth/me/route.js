"use strict";
/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
(() => {
var exports = {};
exports.id = "app/api/auth/me/route";
exports.ids = ["app/api/auth/me/route"];
exports.modules = {

/***/ "@prisma/client":
/*!*********************************!*\
  !*** external "@prisma/client" ***!
  \*********************************/
/***/ ((module) => {

module.exports = require("@prisma/client");

/***/ }),

/***/ "./action-async-storage.external":
/*!*******************************************************************************!*\
  !*** external "next/dist/client/components/action-async-storage.external.js" ***!
  \*******************************************************************************/
/***/ ((module) => {

module.exports = require("next/dist/client/components/action-async-storage.external.js");

/***/ }),

/***/ "./request-async-storage.external":
/*!********************************************************************************!*\
  !*** external "next/dist/client/components/request-async-storage.external.js" ***!
  \********************************************************************************/
/***/ ((module) => {

module.exports = require("next/dist/client/components/request-async-storage.external.js");

/***/ }),

/***/ "./static-generation-async-storage.external":
/*!******************************************************************************************!*\
  !*** external "next/dist/client/components/static-generation-async-storage.external.js" ***!
  \******************************************************************************************/
/***/ ((module) => {

module.exports = require("next/dist/client/components/static-generation-async-storage.external.js");

/***/ }),

/***/ "next/dist/compiled/next-server/app-page.runtime.dev.js":
/*!*************************************************************************!*\
  !*** external "next/dist/compiled/next-server/app-page.runtime.dev.js" ***!
  \*************************************************************************/
/***/ ((module) => {

module.exports = require("next/dist/compiled/next-server/app-page.runtime.dev.js");

/***/ }),

/***/ "next/dist/compiled/next-server/app-route.runtime.dev.js":
/*!**************************************************************************!*\
  !*** external "next/dist/compiled/next-server/app-route.runtime.dev.js" ***!
  \**************************************************************************/
/***/ ((module) => {

module.exports = require("next/dist/compiled/next-server/app-route.runtime.dev.js");

/***/ }),

/***/ "buffer":
/*!*************************!*\
  !*** external "buffer" ***!
  \*************************/
/***/ ((module) => {

module.exports = require("buffer");

/***/ }),

/***/ "crypto":
/*!*************************!*\
  !*** external "crypto" ***!
  \*************************/
/***/ ((module) => {

module.exports = require("crypto");

/***/ }),

/***/ "stream":
/*!*************************!*\
  !*** external "stream" ***!
  \*************************/
/***/ ((module) => {

module.exports = require("stream");

/***/ }),

/***/ "util":
/*!***********************!*\
  !*** external "util" ***!
  \***********************/
/***/ ((module) => {

module.exports = require("util");

/***/ }),

/***/ "(rsc)/./node_modules/next/dist/build/webpack/loaders/next-app-loader.js?name=app%2Fapi%2Fauth%2Fme%2Froute&page=%2Fapi%2Fauth%2Fme%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Fauth%2Fme%2Froute.ts&appDir=C%3A%5CUsers%5Cuser%5CDocuments%5Ccoding%5Cuserhythm%5Cbackend%5Csrc%5Capp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=C%3A%5CUsers%5Cuser%5CDocuments%5Ccoding%5Cuserhythm%5Cbackend&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D!":
/*!*****************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************!*\
  !*** ./node_modules/next/dist/build/webpack/loaders/next-app-loader.js?name=app%2Fapi%2Fauth%2Fme%2Froute&page=%2Fapi%2Fauth%2Fme%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Fauth%2Fme%2Froute.ts&appDir=C%3A%5CUsers%5Cuser%5CDocuments%5Ccoding%5Cuserhythm%5Cbackend%5Csrc%5Capp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=C%3A%5CUsers%5Cuser%5CDocuments%5Ccoding%5Cuserhythm%5Cbackend&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D! ***!
  \*****************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   originalPathname: () => (/* binding */ originalPathname),\n/* harmony export */   patchFetch: () => (/* binding */ patchFetch),\n/* harmony export */   requestAsyncStorage: () => (/* binding */ requestAsyncStorage),\n/* harmony export */   routeModule: () => (/* binding */ routeModule),\n/* harmony export */   serverHooks: () => (/* binding */ serverHooks),\n/* harmony export */   staticGenerationAsyncStorage: () => (/* binding */ staticGenerationAsyncStorage)\n/* harmony export */ });\n/* harmony import */ var next_dist_server_future_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! next/dist/server/future/route-modules/app-route/module.compiled */ \"(rsc)/./node_modules/next/dist/server/future/route-modules/app-route/module.compiled.js\");\n/* harmony import */ var next_dist_server_future_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(next_dist_server_future_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0__);\n/* harmony import */ var next_dist_server_future_route_kind__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! next/dist/server/future/route-kind */ \"(rsc)/./node_modules/next/dist/server/future/route-kind.js\");\n/* harmony import */ var next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! next/dist/server/lib/patch-fetch */ \"(rsc)/./node_modules/next/dist/server/lib/patch-fetch.js\");\n/* harmony import */ var next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2__);\n/* harmony import */ var C_Users_user_Documents_coding_userhythm_backend_src_app_api_auth_me_route_ts__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./src/app/api/auth/me/route.ts */ \"(rsc)/./src/app/api/auth/me/route.ts\");\n\n\n\n\n// We inject the nextConfigOutput here so that we can use them in the route\n// module.\nconst nextConfigOutput = \"\"\nconst routeModule = new next_dist_server_future_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0__.AppRouteRouteModule({\n    definition: {\n        kind: next_dist_server_future_route_kind__WEBPACK_IMPORTED_MODULE_1__.RouteKind.APP_ROUTE,\n        page: \"/api/auth/me/route\",\n        pathname: \"/api/auth/me\",\n        filename: \"route\",\n        bundlePath: \"app/api/auth/me/route\"\n    },\n    resolvedPagePath: \"C:\\\\Users\\\\user\\\\Documents\\\\coding\\\\userhythm\\\\backend\\\\src\\\\app\\\\api\\\\auth\\\\me\\\\route.ts\",\n    nextConfigOutput,\n    userland: C_Users_user_Documents_coding_userhythm_backend_src_app_api_auth_me_route_ts__WEBPACK_IMPORTED_MODULE_3__\n});\n// Pull out the exports that we need to expose from the module. This should\n// be eliminated when we've moved the other routes to the new format. These\n// are used to hook into the route.\nconst { requestAsyncStorage, staticGenerationAsyncStorage, serverHooks } = routeModule;\nconst originalPathname = \"/api/auth/me/route\";\nfunction patchFetch() {\n    return (0,next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2__.patchFetch)({\n        serverHooks,\n        staticGenerationAsyncStorage\n    });\n}\n\n\n//# sourceMappingURL=app-route.js.map//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9ub2RlX21vZHVsZXMvbmV4dC9kaXN0L2J1aWxkL3dlYnBhY2svbG9hZGVycy9uZXh0LWFwcC1sb2FkZXIuanM/bmFtZT1hcHAlMkZhcGklMkZhdXRoJTJGbWUlMkZyb3V0ZSZwYWdlPSUyRmFwaSUyRmF1dGglMkZtZSUyRnJvdXRlJmFwcFBhdGhzPSZwYWdlUGF0aD1wcml2YXRlLW5leHQtYXBwLWRpciUyRmFwaSUyRmF1dGglMkZtZSUyRnJvdXRlLnRzJmFwcERpcj1DJTNBJTVDVXNlcnMlNUN1c2VyJTVDRG9jdW1lbnRzJTVDY29kaW5nJTVDdXNlcmh5dGhtJTVDYmFja2VuZCU1Q3NyYyU1Q2FwcCZwYWdlRXh0ZW5zaW9ucz10c3gmcGFnZUV4dGVuc2lvbnM9dHMmcGFnZUV4dGVuc2lvbnM9anN4JnBhZ2VFeHRlbnNpb25zPWpzJnJvb3REaXI9QyUzQSU1Q1VzZXJzJTVDdXNlciU1Q0RvY3VtZW50cyU1Q2NvZGluZyU1Q3VzZXJoeXRobSU1Q2JhY2tlbmQmaXNEZXY9dHJ1ZSZ0c2NvbmZpZ1BhdGg9dHNjb25maWcuanNvbiZiYXNlUGF0aD0mYXNzZXRQcmVmaXg9Jm5leHRDb25maWdPdXRwdXQ9JnByZWZlcnJlZFJlZ2lvbj0mbWlkZGxld2FyZUNvbmZpZz1lMzAlM0QhIiwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7OztBQUFzRztBQUN2QztBQUNjO0FBQ3lDO0FBQ3RIO0FBQ0E7QUFDQTtBQUNBLHdCQUF3QixnSEFBbUI7QUFDM0M7QUFDQSxjQUFjLHlFQUFTO0FBQ3ZCO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsS0FBSztBQUNMO0FBQ0E7QUFDQSxZQUFZO0FBQ1osQ0FBQztBQUNEO0FBQ0E7QUFDQTtBQUNBLFFBQVEsaUVBQWlFO0FBQ3pFO0FBQ0E7QUFDQSxXQUFXLDRFQUFXO0FBQ3RCO0FBQ0E7QUFDQSxLQUFLO0FBQ0w7QUFDdUg7O0FBRXZIIiwic291cmNlcyI6WyJ3ZWJwYWNrOi8vYmFja2VuZC8/MmZhNCJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBBcHBSb3V0ZVJvdXRlTW9kdWxlIH0gZnJvbSBcIm5leHQvZGlzdC9zZXJ2ZXIvZnV0dXJlL3JvdXRlLW1vZHVsZXMvYXBwLXJvdXRlL21vZHVsZS5jb21waWxlZFwiO1xuaW1wb3J0IHsgUm91dGVLaW5kIH0gZnJvbSBcIm5leHQvZGlzdC9zZXJ2ZXIvZnV0dXJlL3JvdXRlLWtpbmRcIjtcbmltcG9ydCB7IHBhdGNoRmV0Y2ggYXMgX3BhdGNoRmV0Y2ggfSBmcm9tIFwibmV4dC9kaXN0L3NlcnZlci9saWIvcGF0Y2gtZmV0Y2hcIjtcbmltcG9ydCAqIGFzIHVzZXJsYW5kIGZyb20gXCJDOlxcXFxVc2Vyc1xcXFx1c2VyXFxcXERvY3VtZW50c1xcXFxjb2RpbmdcXFxcdXNlcmh5dGhtXFxcXGJhY2tlbmRcXFxcc3JjXFxcXGFwcFxcXFxhcGlcXFxcYXV0aFxcXFxtZVxcXFxyb3V0ZS50c1wiO1xuLy8gV2UgaW5qZWN0IHRoZSBuZXh0Q29uZmlnT3V0cHV0IGhlcmUgc28gdGhhdCB3ZSBjYW4gdXNlIHRoZW0gaW4gdGhlIHJvdXRlXG4vLyBtb2R1bGUuXG5jb25zdCBuZXh0Q29uZmlnT3V0cHV0ID0gXCJcIlxuY29uc3Qgcm91dGVNb2R1bGUgPSBuZXcgQXBwUm91dGVSb3V0ZU1vZHVsZSh7XG4gICAgZGVmaW5pdGlvbjoge1xuICAgICAgICBraW5kOiBSb3V0ZUtpbmQuQVBQX1JPVVRFLFxuICAgICAgICBwYWdlOiBcIi9hcGkvYXV0aC9tZS9yb3V0ZVwiLFxuICAgICAgICBwYXRobmFtZTogXCIvYXBpL2F1dGgvbWVcIixcbiAgICAgICAgZmlsZW5hbWU6IFwicm91dGVcIixcbiAgICAgICAgYnVuZGxlUGF0aDogXCJhcHAvYXBpL2F1dGgvbWUvcm91dGVcIlxuICAgIH0sXG4gICAgcmVzb2x2ZWRQYWdlUGF0aDogXCJDOlxcXFxVc2Vyc1xcXFx1c2VyXFxcXERvY3VtZW50c1xcXFxjb2RpbmdcXFxcdXNlcmh5dGhtXFxcXGJhY2tlbmRcXFxcc3JjXFxcXGFwcFxcXFxhcGlcXFxcYXV0aFxcXFxtZVxcXFxyb3V0ZS50c1wiLFxuICAgIG5leHRDb25maWdPdXRwdXQsXG4gICAgdXNlcmxhbmRcbn0pO1xuLy8gUHVsbCBvdXQgdGhlIGV4cG9ydHMgdGhhdCB3ZSBuZWVkIHRvIGV4cG9zZSBmcm9tIHRoZSBtb2R1bGUuIFRoaXMgc2hvdWxkXG4vLyBiZSBlbGltaW5hdGVkIHdoZW4gd2UndmUgbW92ZWQgdGhlIG90aGVyIHJvdXRlcyB0byB0aGUgbmV3IGZvcm1hdC4gVGhlc2Vcbi8vIGFyZSB1c2VkIHRvIGhvb2sgaW50byB0aGUgcm91dGUuXG5jb25zdCB7IHJlcXVlc3RBc3luY1N0b3JhZ2UsIHN0YXRpY0dlbmVyYXRpb25Bc3luY1N0b3JhZ2UsIHNlcnZlckhvb2tzIH0gPSByb3V0ZU1vZHVsZTtcbmNvbnN0IG9yaWdpbmFsUGF0aG5hbWUgPSBcIi9hcGkvYXV0aC9tZS9yb3V0ZVwiO1xuZnVuY3Rpb24gcGF0Y2hGZXRjaCgpIHtcbiAgICByZXR1cm4gX3BhdGNoRmV0Y2goe1xuICAgICAgICBzZXJ2ZXJIb29rcyxcbiAgICAgICAgc3RhdGljR2VuZXJhdGlvbkFzeW5jU3RvcmFnZVxuICAgIH0pO1xufVxuZXhwb3J0IHsgcm91dGVNb2R1bGUsIHJlcXVlc3RBc3luY1N0b3JhZ2UsIHN0YXRpY0dlbmVyYXRpb25Bc3luY1N0b3JhZ2UsIHNlcnZlckhvb2tzLCBvcmlnaW5hbFBhdGhuYW1lLCBwYXRjaEZldGNoLCAgfTtcblxuLy8jIHNvdXJjZU1hcHBpbmdVUkw9YXBwLXJvdXRlLmpzLm1hcCJdLCJuYW1lcyI6W10sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(rsc)/./node_modules/next/dist/build/webpack/loaders/next-app-loader.js?name=app%2Fapi%2Fauth%2Fme%2Froute&page=%2Fapi%2Fauth%2Fme%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Fauth%2Fme%2Froute.ts&appDir=C%3A%5CUsers%5Cuser%5CDocuments%5Ccoding%5Cuserhythm%5Cbackend%5Csrc%5Capp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=C%3A%5CUsers%5Cuser%5CDocuments%5Ccoding%5Cuserhythm%5Cbackend&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D!\n");

/***/ }),

/***/ "(rsc)/./src/app/api/auth/me/route.ts":
/*!**************************************!*\
  !*** ./src/app/api/auth/me/route.ts ***!
  \**************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   GET: () => (/* binding */ GET),\n/* harmony export */   runtime: () => (/* binding */ runtime)\n/* harmony export */ });\n/* harmony import */ var next_server__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! next/server */ \"(rsc)/./node_modules/next/dist/api/server.js\");\n/* harmony import */ var _lib_prisma__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../../../lib/prisma */ \"(rsc)/./src/lib/prisma.ts\");\n/* harmony import */ var _lib_auth__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../../../lib/auth */ \"(rsc)/./src/lib/auth.ts\");\n\n\n\nconst runtime = \"nodejs\";\nasync function GET(req) {\n    try {\n        const session = (0,_lib_auth__WEBPACK_IMPORTED_MODULE_2__.getSessionFromRequest)(req);\n        if (!session) {\n            return next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.json({\n                user: null\n            }, {\n                status: 200\n            });\n        }\n        const user = await _lib_prisma__WEBPACK_IMPORTED_MODULE_1__.prisma.user.findUnique({\n            where: {\n                id: session.userId\n            },\n            include: {\n                profile: true\n            }\n        });\n        if (!user) return next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.json({\n            user: null\n        }, {\n            status: 200\n        });\n        return next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.json({\n            user: {\n                id: user.id,\n                email: user.email,\n                role: user.role,\n                profile: user.profile\n            }\n        });\n    } catch (error) {\n        console.error(\"me error\", error);\n        return next_server__WEBPACK_IMPORTED_MODULE_0__.NextResponse.json({\n            error: \"failed to fetch session\"\n        }, {\n            status: 500\n        });\n    }\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9zcmMvYXBwL2FwaS9hdXRoL21lL3JvdXRlLnRzIiwibWFwcGluZ3MiOiI7Ozs7Ozs7O0FBQXdEO0FBQ1I7QUFDYTtBQUV0RCxNQUFNRyxVQUFVLFNBQVM7QUFFekIsZUFBZUMsSUFBSUMsR0FBZ0I7SUFDeEMsSUFBSTtRQUNGLE1BQU1DLFVBQVVKLGdFQUFxQkEsQ0FBQ0c7UUFDdEMsSUFBSSxDQUFDQyxTQUFTO1lBQ1osT0FBT04scURBQVlBLENBQUNPLElBQUksQ0FBQztnQkFBRUMsTUFBTTtZQUFLLEdBQUc7Z0JBQUVDLFFBQVE7WUFBSTtRQUN6RDtRQUNBLE1BQU1ELE9BQU8sTUFBTVAsK0NBQU1BLENBQUNPLElBQUksQ0FBQ0UsVUFBVSxDQUFDO1lBQ3hDQyxPQUFPO2dCQUFFQyxJQUFJTixRQUFRTyxNQUFNO1lBQUM7WUFDNUJDLFNBQVM7Z0JBQUVDLFNBQVM7WUFBSztRQUMzQjtRQUNBLElBQUksQ0FBQ1AsTUFBTSxPQUFPUixxREFBWUEsQ0FBQ08sSUFBSSxDQUFDO1lBQUVDLE1BQU07UUFBSyxHQUFHO1lBQUVDLFFBQVE7UUFBSTtRQUNsRSxPQUFPVCxxREFBWUEsQ0FBQ08sSUFBSSxDQUFDO1lBQUVDLE1BQU07Z0JBQUVJLElBQUlKLEtBQUtJLEVBQUU7Z0JBQUVJLE9BQU9SLEtBQUtRLEtBQUs7Z0JBQUVDLE1BQU1ULEtBQUtTLElBQUk7Z0JBQUVGLFNBQVNQLEtBQUtPLE9BQU87WUFBQztRQUFFO0lBQzlHLEVBQUUsT0FBT0csT0FBTztRQUNkQyxRQUFRRCxLQUFLLENBQUMsWUFBWUE7UUFDMUIsT0FBT2xCLHFEQUFZQSxDQUFDTyxJQUFJLENBQUM7WUFBRVcsT0FBTztRQUEwQixHQUFHO1lBQUVULFFBQVE7UUFBSTtJQUMvRTtBQUNGIiwic291cmNlcyI6WyJ3ZWJwYWNrOi8vYmFja2VuZC8uL3NyYy9hcHAvYXBpL2F1dGgvbWUvcm91dGUudHM/NThiZiJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBOZXh0UmVxdWVzdCwgTmV4dFJlc3BvbnNlIH0gZnJvbSAnbmV4dC9zZXJ2ZXInO1xyXG5pbXBvcnQgeyBwcmlzbWEgfSBmcm9tICcuLi8uLi8uLi8uLi9saWIvcHJpc21hJztcclxuaW1wb3J0IHsgZ2V0U2Vzc2lvbkZyb21SZXF1ZXN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vbGliL2F1dGgnO1xyXG5cclxuZXhwb3J0IGNvbnN0IHJ1bnRpbWUgPSAnbm9kZWpzJztcclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBHRVQocmVxOiBOZXh0UmVxdWVzdCkge1xyXG4gIHRyeSB7XHJcbiAgICBjb25zdCBzZXNzaW9uID0gZ2V0U2Vzc2lvbkZyb21SZXF1ZXN0KHJlcSk7XHJcbiAgICBpZiAoIXNlc3Npb24pIHtcclxuICAgICAgcmV0dXJuIE5leHRSZXNwb25zZS5qc29uKHsgdXNlcjogbnVsbCB9LCB7IHN0YXR1czogMjAwIH0pO1xyXG4gICAgfVxyXG4gICAgY29uc3QgdXNlciA9IGF3YWl0IHByaXNtYS51c2VyLmZpbmRVbmlxdWUoe1xyXG4gICAgICB3aGVyZTogeyBpZDogc2Vzc2lvbi51c2VySWQgfSxcclxuICAgICAgaW5jbHVkZTogeyBwcm9maWxlOiB0cnVlIH0sXHJcbiAgICB9KTtcclxuICAgIGlmICghdXNlcikgcmV0dXJuIE5leHRSZXNwb25zZS5qc29uKHsgdXNlcjogbnVsbCB9LCB7IHN0YXR1czogMjAwIH0pO1xyXG4gICAgcmV0dXJuIE5leHRSZXNwb25zZS5qc29uKHsgdXNlcjogeyBpZDogdXNlci5pZCwgZW1haWw6IHVzZXIuZW1haWwsIHJvbGU6IHVzZXIucm9sZSwgcHJvZmlsZTogdXNlci5wcm9maWxlIH0gfSk7XHJcbiAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgIGNvbnNvbGUuZXJyb3IoJ21lIGVycm9yJywgZXJyb3IpO1xyXG4gICAgcmV0dXJuIE5leHRSZXNwb25zZS5qc29uKHsgZXJyb3I6ICdmYWlsZWQgdG8gZmV0Y2ggc2Vzc2lvbicgfSwgeyBzdGF0dXM6IDUwMCB9KTtcclxuICB9XHJcbn1cclxuXHJcbiJdLCJuYW1lcyI6WyJOZXh0UmVzcG9uc2UiLCJwcmlzbWEiLCJnZXRTZXNzaW9uRnJvbVJlcXVlc3QiLCJydW50aW1lIiwiR0VUIiwicmVxIiwic2Vzc2lvbiIsImpzb24iLCJ1c2VyIiwic3RhdHVzIiwiZmluZFVuaXF1ZSIsIndoZXJlIiwiaWQiLCJ1c2VySWQiLCJpbmNsdWRlIiwicHJvZmlsZSIsImVtYWlsIiwicm9sZSIsImVycm9yIiwiY29uc29sZSJdLCJzb3VyY2VSb290IjoiIn0=\n//# sourceURL=webpack-internal:///(rsc)/./src/app/api/auth/me/route.ts\n");

/***/ }),

/***/ "(rsc)/./src/lib/auth.ts":
/*!*************************!*\
  !*** ./src/lib/auth.ts ***!
  \*************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   clearSessionCookie: () => (/* binding */ clearSessionCookie),\n/* harmony export */   getSessionFromRequest: () => (/* binding */ getSessionFromRequest),\n/* harmony export */   setSessionCookie: () => (/* binding */ setSessionCookie),\n/* harmony export */   signSession: () => (/* binding */ signSession)\n/* harmony export */ });\n/* harmony import */ var jsonwebtoken__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! jsonwebtoken */ \"(rsc)/./node_modules/jsonwebtoken/index.js\");\n/* harmony import */ var jsonwebtoken__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(jsonwebtoken__WEBPACK_IMPORTED_MODULE_0__);\n/* harmony import */ var next_headers__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! next/headers */ \"(rsc)/./node_modules/next/dist/api/headers.js\");\n\n\nconst SESSION_COOKIE = \"ur_session\";\nconst SESSION_SECRET = process.env.SESSION_SECRET || \"dev-secret-change-me\";\nconst SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 7; // 7 days\nconst COOKIE_DOMAIN = process.env.COOKIE_DOMAIN;\nconst isProd = \"development\" === \"production\";\nconst signSession = (payload)=>jsonwebtoken__WEBPACK_IMPORTED_MODULE_0___default().sign(payload, SESSION_SECRET, {\n        expiresIn: SESSION_MAX_AGE_SEC\n    });\nconst setSessionCookie = (token)=>{\n    const cookieStore = (0,next_headers__WEBPACK_IMPORTED_MODULE_1__.cookies)();\n    cookieStore.set(SESSION_COOKIE, token, {\n        httpOnly: true,\n        // 서로 다른 서브도메인(userhythm.kr vs api.userhythm.kr) 간 쿠키 전달을 위해 None/secure 사용\n        sameSite: isProd ? \"none\" : \"lax\",\n        secure: isProd,\n        path: \"/\",\n        maxAge: SESSION_MAX_AGE_SEC,\n        domain: COOKIE_DOMAIN || undefined\n    });\n};\nconst clearSessionCookie = ()=>{\n    const cookieStore = (0,next_headers__WEBPACK_IMPORTED_MODULE_1__.cookies)();\n    cookieStore.set(SESSION_COOKIE, \"\", {\n        httpOnly: true,\n        sameSite: isProd ? \"none\" : \"lax\",\n        secure: isProd,\n        path: \"/\",\n        maxAge: 0,\n        domain: COOKIE_DOMAIN || undefined\n    });\n};\nconst getSessionFromRequest = (req)=>{\n    const cookie = req.cookies.get(SESSION_COOKIE)?.value;\n    if (!cookie) return null;\n    try {\n        return jsonwebtoken__WEBPACK_IMPORTED_MODULE_0___default().verify(cookie, SESSION_SECRET);\n    } catch  {\n        return null;\n    }\n};\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9zcmMvbGliL2F1dGgudHMiLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7OztBQUErQjtBQUNRO0FBR3ZDLE1BQU1FLGlCQUFpQjtBQUN2QixNQUFNQyxpQkFBaUJDLFFBQVFDLEdBQUcsQ0FBQ0YsY0FBYyxJQUFJO0FBQ3JELE1BQU1HLHNCQUFzQixLQUFLLEtBQUssS0FBSyxHQUFHLFNBQVM7QUFDdkQsTUFBTUMsZ0JBQWdCSCxRQUFRQyxHQUFHLENBQUNFLGFBQWE7QUFDL0MsTUFBTUMsU0FBU0osa0JBQXlCO0FBT2pDLE1BQU1LLGNBQWMsQ0FBQ0MsVUFDMUJWLHdEQUFRLENBQUNVLFNBQVNQLGdCQUFnQjtRQUFFUyxXQUFXTjtJQUFvQixHQUFHO0FBRWpFLE1BQU1PLG1CQUFtQixDQUFDQztJQUMvQixNQUFNQyxjQUFjZCxxREFBT0E7SUFDM0JjLFlBQVlDLEdBQUcsQ0FBQ2QsZ0JBQWdCWSxPQUFPO1FBQ3JDRyxVQUFVO1FBQ1YsMkVBQTJFO1FBQzNFQyxVQUFVVixTQUFTLFNBQVM7UUFDNUJXLFFBQVFYO1FBQ1JZLE1BQU07UUFDTkMsUUFBUWY7UUFDUmdCLFFBQVFmLGlCQUFpQmdCO0lBQzNCO0FBQ0YsRUFBRTtBQUVLLE1BQU1DLHFCQUFxQjtJQUNoQyxNQUFNVCxjQUFjZCxxREFBT0E7SUFDM0JjLFlBQVlDLEdBQUcsQ0FBQ2QsZ0JBQWdCLElBQUk7UUFDbENlLFVBQVU7UUFDVkMsVUFBVVYsU0FBUyxTQUFTO1FBQzVCVyxRQUFRWDtRQUNSWSxNQUFNO1FBQ05DLFFBQVE7UUFDUkMsUUFBUWYsaUJBQWlCZ0I7SUFDM0I7QUFDRixFQUFFO0FBRUssTUFBTUUsd0JBQXdCLENBQUNDO0lBQ3BDLE1BQU1DLFNBQVNELElBQUl6QixPQUFPLENBQUMyQixHQUFHLENBQUMxQixpQkFBaUIyQjtJQUNoRCxJQUFJLENBQUNGLFFBQVEsT0FBTztJQUNwQixJQUFJO1FBQ0YsT0FBTzNCLDBEQUFVLENBQUMyQixRQUFReEI7SUFDNUIsRUFBRSxPQUFNO1FBQ04sT0FBTztJQUNUO0FBQ0YsRUFBRSIsInNvdXJjZXMiOlsid2VicGFjazovL2JhY2tlbmQvLi9zcmMvbGliL2F1dGgudHM/NjY5MiJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgand0IGZyb20gJ2pzb253ZWJ0b2tlbic7XHJcbmltcG9ydCB7IGNvb2tpZXMgfSBmcm9tICduZXh0L2hlYWRlcnMnO1xyXG5pbXBvcnQgeyBOZXh0UmVxdWVzdCB9IGZyb20gJ25leHQvc2VydmVyJztcclxuXHJcbmNvbnN0IFNFU1NJT05fQ09PS0lFID0gJ3VyX3Nlc3Npb24nO1xyXG5jb25zdCBTRVNTSU9OX1NFQ1JFVCA9IHByb2Nlc3MuZW52LlNFU1NJT05fU0VDUkVUIHx8ICdkZXYtc2VjcmV0LWNoYW5nZS1tZSc7XHJcbmNvbnN0IFNFU1NJT05fTUFYX0FHRV9TRUMgPSA2MCAqIDYwICogMjQgKiA3OyAvLyA3IGRheXNcclxuY29uc3QgQ09PS0lFX0RPTUFJTiA9IHByb2Nlc3MuZW52LkNPT0tJRV9ET01BSU47XHJcbmNvbnN0IGlzUHJvZCA9IHByb2Nlc3MuZW52Lk5PREVfRU5WID09PSAncHJvZHVjdGlvbic7XHJcblxyXG5pbnRlcmZhY2UgU2Vzc2lvblBheWxvYWQge1xyXG4gIHVzZXJJZDogc3RyaW5nO1xyXG4gIHJvbGU6IHN0cmluZztcclxufVxyXG5cclxuZXhwb3J0IGNvbnN0IHNpZ25TZXNzaW9uID0gKHBheWxvYWQ6IFNlc3Npb25QYXlsb2FkKSA9PlxyXG4gIGp3dC5zaWduKHBheWxvYWQsIFNFU1NJT05fU0VDUkVULCB7IGV4cGlyZXNJbjogU0VTU0lPTl9NQVhfQUdFX1NFQyB9KTtcclxuXHJcbmV4cG9ydCBjb25zdCBzZXRTZXNzaW9uQ29va2llID0gKHRva2VuOiBzdHJpbmcpID0+IHtcclxuICBjb25zdCBjb29raWVTdG9yZSA9IGNvb2tpZXMoKTtcclxuICBjb29raWVTdG9yZS5zZXQoU0VTU0lPTl9DT09LSUUsIHRva2VuLCB7XHJcbiAgICBodHRwT25seTogdHJ1ZSxcclxuICAgIC8vIOyEnOuhnCDri6Trpbgg7ISc67iM64+E66mU7J24KHVzZXJoeXRobS5rciB2cyBhcGkudXNlcmh5dGhtLmtyKSDqsIQg7L+g7YKkIOyghOuLrOydhCDsnITtlbQgTm9uZS9zZWN1cmUg7IKs7JqpXHJcbiAgICBzYW1lU2l0ZTogaXNQcm9kID8gJ25vbmUnIDogJ2xheCcsXHJcbiAgICBzZWN1cmU6IGlzUHJvZCxcclxuICAgIHBhdGg6ICcvJyxcclxuICAgIG1heEFnZTogU0VTU0lPTl9NQVhfQUdFX1NFQyxcclxuICAgIGRvbWFpbjogQ09PS0lFX0RPTUFJTiB8fCB1bmRlZmluZWQsXHJcbiAgfSk7XHJcbn07XHJcblxyXG5leHBvcnQgY29uc3QgY2xlYXJTZXNzaW9uQ29va2llID0gKCkgPT4ge1xyXG4gIGNvbnN0IGNvb2tpZVN0b3JlID0gY29va2llcygpO1xyXG4gIGNvb2tpZVN0b3JlLnNldChTRVNTSU9OX0NPT0tJRSwgJycsIHtcclxuICAgIGh0dHBPbmx5OiB0cnVlLFxyXG4gICAgc2FtZVNpdGU6IGlzUHJvZCA/ICdub25lJyA6ICdsYXgnLFxyXG4gICAgc2VjdXJlOiBpc1Byb2QsXHJcbiAgICBwYXRoOiAnLycsXHJcbiAgICBtYXhBZ2U6IDAsXHJcbiAgICBkb21haW46IENPT0tJRV9ET01BSU4gfHwgdW5kZWZpbmVkLFxyXG4gIH0pO1xyXG59O1xyXG5cclxuZXhwb3J0IGNvbnN0IGdldFNlc3Npb25Gcm9tUmVxdWVzdCA9IChyZXE6IE5leHRSZXF1ZXN0KTogU2Vzc2lvblBheWxvYWQgfCBudWxsID0+IHtcclxuICBjb25zdCBjb29raWUgPSByZXEuY29va2llcy5nZXQoU0VTU0lPTl9DT09LSUUpPy52YWx1ZTtcclxuICBpZiAoIWNvb2tpZSkgcmV0dXJuIG51bGw7XHJcbiAgdHJ5IHtcclxuICAgIHJldHVybiBqd3QudmVyaWZ5KGNvb2tpZSwgU0VTU0lPTl9TRUNSRVQpIGFzIFNlc3Npb25QYXlsb2FkO1xyXG4gIH0gY2F0Y2gge1xyXG4gICAgcmV0dXJuIG51bGw7XHJcbiAgfVxyXG59O1xyXG5cclxuIl0sIm5hbWVzIjpbImp3dCIsImNvb2tpZXMiLCJTRVNTSU9OX0NPT0tJRSIsIlNFU1NJT05fU0VDUkVUIiwicHJvY2VzcyIsImVudiIsIlNFU1NJT05fTUFYX0FHRV9TRUMiLCJDT09LSUVfRE9NQUlOIiwiaXNQcm9kIiwic2lnblNlc3Npb24iLCJwYXlsb2FkIiwic2lnbiIsImV4cGlyZXNJbiIsInNldFNlc3Npb25Db29raWUiLCJ0b2tlbiIsImNvb2tpZVN0b3JlIiwic2V0IiwiaHR0cE9ubHkiLCJzYW1lU2l0ZSIsInNlY3VyZSIsInBhdGgiLCJtYXhBZ2UiLCJkb21haW4iLCJ1bmRlZmluZWQiLCJjbGVhclNlc3Npb25Db29raWUiLCJnZXRTZXNzaW9uRnJvbVJlcXVlc3QiLCJyZXEiLCJjb29raWUiLCJnZXQiLCJ2YWx1ZSIsInZlcmlmeSJdLCJzb3VyY2VSb290IjoiIn0=\n//# sourceURL=webpack-internal:///(rsc)/./src/lib/auth.ts\n");

/***/ }),

/***/ "(rsc)/./src/lib/prisma.ts":
/*!***************************!*\
  !*** ./src/lib/prisma.ts ***!
  \***************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   prisma: () => (/* binding */ prisma)\n/* harmony export */ });\n/* harmony import */ var _prisma_client__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! @prisma/client */ \"@prisma/client\");\n/* harmony import */ var _prisma_client__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(_prisma_client__WEBPACK_IMPORTED_MODULE_0__);\n\nconst prisma = global.prisma || // Prisma 5.21.1 타입 정의가 옵션 객체를 강제하므로, 빈 옵션을 any로 캐스팅해 전달한다.\nnew _prisma_client__WEBPACK_IMPORTED_MODULE_0__.PrismaClient({});\nif (true) {\n    global.prisma = prisma;\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9zcmMvbGliL3ByaXNtYS50cyIsIm1hcHBpbmdzIjoiOzs7Ozs7QUFBOEM7QUFRdkMsTUFBTUMsU0FDWEMsT0FBT0QsTUFBTSxJQUNiLDJEQUEyRDtBQUMzRCxJQUFJRCx3REFBWUEsQ0FBQyxDQUFDLEdBQVU7QUFFOUIsSUFBSUcsSUFBeUIsRUFBYztJQUN6Q0QsT0FBT0QsTUFBTSxHQUFHQTtBQUNsQiIsInNvdXJjZXMiOlsid2VicGFjazovL2JhY2tlbmQvLi9zcmMvbGliL3ByaXNtYS50cz8wMWQ3Il0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IFByaXNtYUNsaWVudCB9IGZyb20gJ0BwcmlzbWEvY2xpZW50JztcclxuXHJcbmRlY2xhcmUgZ2xvYmFsIHtcclxuICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tdmFyXHJcbiAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXVudXNlZC12YXJcclxuICB2YXIgcHJpc21hOiBQcmlzbWFDbGllbnQgfCB1bmRlZmluZWQ7XHJcbn1cclxuXHJcbmV4cG9ydCBjb25zdCBwcmlzbWEgPVxyXG4gIGdsb2JhbC5wcmlzbWEgfHxcclxuICAvLyBQcmlzbWEgNS4yMS4xIO2DgOyehSDsoJXsnZjqsIAg7Ji17IWYIOqwneyytOulvCDqsJXsoJztlZjrr4DroZwsIOu5iCDsmLXshZjsnYQgYW5566GcIOy6kOyKpO2Mhe2VtCDsoITri6ztlZzri6QuXHJcbiAgbmV3IFByaXNtYUNsaWVudCh7fSBhcyBhbnkpO1xyXG5cclxuaWYgKHByb2Nlc3MuZW52Lk5PREVfRU5WICE9PSAncHJvZHVjdGlvbicpIHtcclxuICBnbG9iYWwucHJpc21hID0gcHJpc21hO1xyXG59XHJcbiJdLCJuYW1lcyI6WyJQcmlzbWFDbGllbnQiLCJwcmlzbWEiLCJnbG9iYWwiLCJwcm9jZXNzIl0sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(rsc)/./src/lib/prisma.ts\n");

/***/ })

};
;

// load runtime
var __webpack_require__ = require("../../../../webpack-runtime.js");
__webpack_require__.C(exports);
var __webpack_exec__ = (moduleId) => (__webpack_require__(__webpack_require__.s = moduleId))
var __webpack_exports__ = __webpack_require__.X(0, ["vendor-chunks/next","vendor-chunks/semver","vendor-chunks/jsonwebtoken","vendor-chunks/lodash.includes","vendor-chunks/jws","vendor-chunks/lodash.once","vendor-chunks/jwa","vendor-chunks/lodash.isinteger","vendor-chunks/ecdsa-sig-formatter","vendor-chunks/lodash.isplainobject","vendor-chunks/ms","vendor-chunks/lodash.isstring","vendor-chunks/lodash.isnumber","vendor-chunks/lodash.isboolean","vendor-chunks/safe-buffer","vendor-chunks/buffer-equal-constant-time"], () => (__webpack_exec__("(rsc)/./node_modules/next/dist/build/webpack/loaders/next-app-loader.js?name=app%2Fapi%2Fauth%2Fme%2Froute&page=%2Fapi%2Fauth%2Fme%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Fauth%2Fme%2Froute.ts&appDir=C%3A%5CUsers%5Cuser%5CDocuments%5Ccoding%5Cuserhythm%5Cbackend%5Csrc%5Capp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=C%3A%5CUsers%5Cuser%5CDocuments%5Ccoding%5Cuserhythm%5Cbackend&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D!")));
module.exports = __webpack_exports__;

})();