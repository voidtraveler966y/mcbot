# MCBot Android: Node.js motoru (libnode.so, nodejs-mobile) + küçük başlatma köprüsü.
# libnode klasörünü android/hazirla.js indirir: app/libnode/{include/node, bin/<işlemci>/libnode.so}

cmake_minimum_required(VERSION 3.18.1)
project(mcbot-motor)

set(LIBNODE ${CMAKE_CURRENT_SOURCE_DIR}/../../../libnode)

add_library(libnode SHARED IMPORTED)
set_target_properties(libnode PROPERTIES IMPORTED_LOCATION ${LIBNODE}/bin/${ANDROID_ABI}/libnode.so)

add_library(mcbot-motor SHARED mcbot-motor.cpp)
target_include_directories(mcbot-motor PRIVATE ${LIBNODE}/include/node)

find_library(log-lib log)
target_link_libraries(mcbot-motor libnode ${log-lib})
